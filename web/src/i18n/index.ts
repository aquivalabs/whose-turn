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

type Translate = (key: string, values: Values, count?: number) => string;
const bind =
  (translate: Translate) =>
  (key: TextKey, values: Values = {}, count?: number): string =>
    count === undefined ? translate(key, values) : translate(key, values, count);

/** A message for a plain module: `text('status.refresh')`, `text('feed.newCount', { count }, count)` for a plural. */
export const text = bind(i18n.global.t as Translate);

/** The same for a component, bound to the component's i18n scope. */
export const useText = () => bind(useI18n().t as Translate);
