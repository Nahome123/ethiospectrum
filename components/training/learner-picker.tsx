import { getTranslations } from "next-intl/server";

/** Native GET form: progress is tracked for the signed-in member or one child. */
export async function LearnerPicker({
  action,
  dependents,
  selected,
}: {
  action: string;
  dependents: { id: string; name: string }[];
  selected: string;
}) {
  const t = await getTranslations("bootcamp");
  if (dependents.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" method="get">
      <label className="space-y-1 text-sm font-medium" htmlFor="learner">
        <span className="block">{t("trackingFor")}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3"
          defaultValue={selected}
          id="learner"
          name="learner"
        >
          <option value="member">{t("me")}</option>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.name}
            </option>
          ))}
        </select>
      </label>
      <button className="h-9 rounded-lg border px-3 text-sm font-semibold" type="submit">
        {t("switchLearner")}
      </button>
    </form>
  );
}
