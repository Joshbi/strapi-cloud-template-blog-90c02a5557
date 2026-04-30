import type { Core } from '@strapi/strapi';

const LOCALES: Array<{ code: string; name: string; isDefault?: boolean }> = [
  { code: 'en', name: 'English (en)', isDefault: true },
  { code: 'pl', name: 'Polski (pl)' },
];

async function ensureLocales(strapi: Core.Strapi) {
  const localeService = strapi.plugin('i18n')?.service('locales');
  if (!localeService) return;

  const existing = await localeService.find();
  const existingCodes = new Set(existing.map((l: { code: string }) => l.code));

  for (const locale of LOCALES) {
    if (!existingCodes.has(locale.code)) {
      await localeService.create({
        code: locale.code,
        name: locale.name,
        isDefault: locale.isDefault ?? false,
      });
    }
  }

  const defaultLocale = LOCALES.find((l) => l.isDefault);
  if (defaultLocale) {
    await localeService.setDefaultLocale({ code: defaultLocale.code });
  }
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await ensureLocales(strapi);
  },
};
