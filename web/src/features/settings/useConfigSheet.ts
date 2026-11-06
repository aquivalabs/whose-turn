// What both settings sheets share beyond the frame: loading /api/config when the sheet opens, saving to it with the server's refusals mapped onto the form, the unsaved flag and the confirm bar.
import { computed, ref, watch } from 'vue';
import { getJson, post, problemsOf, violationsOf } from '@/lib/api.ts';
import { text } from '@/i18n/index.ts';
import { SERVER_DOWN, writeProblem } from '@/lib/problems.ts';
import type { ApiError } from '@/lib/types.ts';
import { useSheetGuard } from './useSheetGuard.ts';

export const useConfigSheet = <Reply extends { problems?: string[] }>(options: {
  isOpen: () => boolean;
  close: () => void;
  /** Whether the form differs from what was loaded. */
  changed: () => boolean;
  /** Takes a loaded reply into the form; runs again on every open. */
  apply: (reply: Reply) => void | Promise<void>;
}) => {
  const problems = ref<string[]>([]);
  const fieldErrors = ref<Record<string, string>>({});
  const unloaded = ref('');
  const dirty = computed(() => options.isOpen() && !unloaded.value && options.changed());
  const { ask, requestClose, answer } = useSheetGuard(options.isOpen, () => dirty.value, options.close);
  const confirm = (question: string, yes: string, keep: string, run: () => void) => {
    ask.value = { text: question, yes, no: keep, run };
  };

  const load = () =>
    getJson<Reply>('/api/config')
      .then((reply) => {
        unloaded.value = '';
        ask.value = null;
        problems.value = reply.problems || [];
        fieldErrors.value = {};
        return options.apply(reply);
      })
      .catch(() => {
        unloaded.value = text('settings.sheet.cannotLoad', { problem: SERVER_DOWN });
      });

  /** Posts `body` to /api/config. A refusal puts the field messages under their fields and the rest in the alert line; an accepted save runs `saved`. */
  const save = async (body: object, saved: () => unknown) => {
    try {
      const reply = await post<{ error?: ApiError }>('/api/config', body);
      if (reply.error) {
        const found = violationsOf(reply.error);
        fieldErrors.value = Object.fromEntries(
          found.filter((entry) => entry.field !== 'workspaces').map((entry) => [entry.field, entry.description]),
        );
        problems.value = found.length
          ? found.filter((entry) => entry.field === 'workspaces').map((entry) => entry.description)
          : problemsOf(reply.error);
        if (found.length && !problems.value.length) {
          problems.value = [text('settings.sheet.fixMarked')];
        }
        return;
      }
      await saved();
    } catch (error) {
      problems.value = [
        writeProblem(error, { unreachable: text('settings.sheet.keptSaveAgain', { problem: SERVER_DOWN }) }),
      ];
    }
  };

  watch(options.isOpen, (open) => {
    if (open) {
      load();
    }
  });

  return { ask, requestClose, answer, confirm, problems, fieldErrors, unloaded, dirty, save };
};
