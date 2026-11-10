import { watch, type Ref } from 'vue';

/** Keeps the tab icon on the given SVG data URL, typed as SVG; an empty value leaves the icon alone. RMA-450. */
export const useTabIcon = (href: Ref<string | null>) =>
  watch(
    href,
    (value) => {
      if (!value) {
        return;
      }
      const link =
        document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ??
        document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
      link.type = 'image/svg+xml';
      link.href = value;
    },
    { immediate: true },
  );
