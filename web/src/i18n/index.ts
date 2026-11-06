// docs/mechanisms/i18n.md
import { createI18n, useI18n } from 'vue-i18n';
import en from './en/index.ts';

/** The shape every locale must match: the English catalog. */
export type MessageSchema = typeof en;

type Leaves<Tree, Prefix extends string = ''> = {
  [Key in keyof Tree & string]: Tree[Key] extends string ? `${Prefix}${Key}` : Leaves<Tree[Key], `${Prefix}${Key}.`>;
}[keyof Tree & string];

/** Every key of the catalog; a key that is not in it fails the type check. */
export type TextKey = Leaves<MessageSchema>;
type Values = Record<string, unknown>;

/** The window's one i18n instance. */
export const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } });

/** A message for a plain module: `text('status.refresh')`, `text('feed.newCount', { count }, count)` for a plural. */
export const text = (key: TextKey, values: Values = {}, count?: number): string =>
  count === undefined ? i18n.global.t(key, values) : i18n.global.t(key, values, count);

/** The same for a component, bound to the component's i18n scope. */
export const useText = () => {
  const { t } = useI18n();
  return (key: TextKey, values: Values = {}, count?: number): string => (count === undefined ? t(key, values) : t(key, values, count));
};
