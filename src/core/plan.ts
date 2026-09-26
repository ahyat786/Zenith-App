/**
 * Perencana injeksi: menentukan userscript/ekstensi/CSS apa yang harus
 * disuntikkan untuk sebuah URL, dikelompokkan per fase (start/end/idle).
 */

import type { Extension, SiteConfig, UserScript } from '../types';
import { cssInjection, joinPayload, SHIM_SCRIPT, wrapScript } from './inject';
import { extensionScriptsFor, matchUserScript } from './native';

export interface InjectionPlan {
  start: string;
  end: string;
  idle: string;
  css: string;
}

const PHASES = ['document-start', 'document-end', 'document-idle'] as const;
type Phase = (typeof PHASES)[number];

export interface PlanInputs {
  url: string;
  scripts: UserScript[];
  extensions: Extension[];
  globalCss: string;
  siteConfig?: SiteConfig;
}

function fingerprint(scripts: UserScript[], extensions: Extension[]): string {
  const s = scripts
    .filter((x) => x.enabled)
    .map((x) => `${x.id}:${x.updatedAt}:${x.matchAll ? 1 : 0}`)
    .join(',');
  const e = extensions
    .filter((x) => x.enabled)
    .map((x) => `${x.id}:${x.contentScripts.length}:${x.importedAt}`)
    .join(',');
  return `${s}|${e}`;
}

const cache = new Map<string, InjectionPlan>();

export async function planInjections(input: PlanInputs): Promise<InjectionPlan> {
  const { url, scripts, extensions, globalCss, siteConfig } = input;
  const cssParts: string[] = [];
  if (globalCss.trim()) {
    cssParts.push(globalCss);
  }
  if (siteConfig?.customCss?.trim()) {
    cssParts.push(siteConfig.customCss);
  }

  const empty: InjectionPlan = {
    start: '',
    end: '',
    idle: '',
    css: cssParts.length ? cssInjection(cssParts.join('\n')) : '',
  };

  if (!/^https?:\/\//i.test(url)) {
    return empty;
  }

  const buckets: Record<Phase, string[]> = {
    'document-start': [],
    'document-end': [],
    'document-idle': [],
  };
  const cssFiles: string[] = [];

  // 1) Userscript (Via-style)
  for (const script of scripts) {
    if (!script.enabled) {
      continue;
    }
    const matched =
      script.matchAll || (await matchUserScript(script.meta ?? null, url));
    if (!matched) {
      continue;
    }
    const phase = (PHASES as readonly string[]).includes(script.meta?.runAt ?? '')
      ? ((script.meta!.runAt as Phase))
      : 'document-idle';
    buckets[phase].push(
      wrapScript(`us:${script.id}`, script.body || script.code, script.meta?.name ?? script.id),
    );
  }

  // 2) Ekstensi (Kiwi-style content scripts)
  for (const ext of extensions) {
    if (!ext.enabled || ext.contentScripts.length === 0) {
      continue;
    }
    for (const phase of PHASES) {
      const indices = await extensionScriptsFor(
        { contentScripts: ext.contentScripts },
        url,
        phase,
      );
      for (const idx of indices) {
        const cs = ext.contentScripts[idx];
        for (const jsPath of cs.js) {
          const code = ext.files[jsPath];
          if (code) {
            buckets[phase].push(wrapScript(`ext:${ext.id}:${idx}:${jsPath}`, code, `${ext.name}:${jsPath}`));
          }
        }
        for (const cssPath of cs.css) {
          const css = ext.files[cssPath];
          if (css) {
            cssFiles.push(css);
          }
        }
      }
    }
  }

  if (cssFiles.length) {
    cssParts.push(cssFiles.join('\n'));
  }
  const css = cssParts.length ? cssInjection(cssParts.join('\n')) : '';

  const mk = (phase: Phase): string => {
    const parts = buckets[phase];
    if (!parts.length) {
      return '';
    }
    return joinPayload([SHIM_SCRIPT, ...parts]);
  };

  const plan: InjectionPlan = {
    start: mk('document-start'),
    end: mk('document-end'),
    idle: mk('document-idle'),
    css,
  };
  return plan;
}

/** Versi tersimpan-dalam-cache: kunci = url + sidik jari state skrip. */
export async function planCached(input: PlanInputs): Promise<InjectionPlan> {
  const key = `${input.url}::${fingerprint(input.scripts, input.extensions)}::${input.globalCss.length}:${input.siteConfig?.customCss?.length ?? 0}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const plan = await planInjections(input);
  if (cache.size > 60) {
    cache.clear();
  }
  cache.set(key, plan);
  return plan;
}
