// The changelog the server parsed, the last version the user opened, and the versions since; VueUse useLocalStorage keeps the seen version (docs/adr/0002-vueuse-in-the-window.md).
import { computed, ref } from 'vue';
import { createSharedComposable, useLocalStorage } from '@vueuse/core';
import { getJson, problemsOf } from '@/lib/api.ts';
import { SERVER_DOWN } from '@/lib/problems.ts';
import { unseenVersions, type Changelog } from '@/lib/whats-new.ts';
import type { ApiError } from '@/lib/types.ts';

export const SEEN_KEY = 'wt-seen-version';

export const useWhatsNew = createSharedComposable(() => {
  const seen = useLocalStorage(SEEN_KEY, '');
  const changelog = ref<Changelog | null>(null);
  const problem = ref('');
  const unseen = computed(() =>
    changelog.value ? unseenVersions(changelog.value.versions, seen.value, changelog.value.current) : [],
  );

  const markSeen = () => {
    if (changelog.value) {
      seen.value = changelog.value.current;
    }
  };
  const load = async () => {
    problem.value = '';
    try {
      const reply = await getJson<Changelog & { error?: ApiError }>('/api/changelog');
      if (reply.error) {
        problem.value = problemsOf(reply.error).join('  ·  ');
        return;
      }
      changelog.value = reply;
      if (!seen.value) {
        seen.value = reply.current;
      }
    } catch {
      problem.value = SERVER_DOWN;
    }
  };

  return { changelog, problem, unseen, load, markSeen };
});
