import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { setUserRoleAction } from "@/lib/services/config-actions";
import { formatDate } from "@/lib/services/display";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

const roleFilters = ["all", "member", "specialist", "administrator"] as const;
const assignableRoles = ["member", "specialist", "administrator"] as const;

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole.usersPage" });
  const role = roleFilters.find((value) => value === search.role) ?? "all";
  const query = typeof search.q === "string" ? search.q.slice(0, 120) : "";
  const page = Math.max(1, Number(search.page) || 1);
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    input_search: query || undefined,
    input_role: role === "all" ? undefined : role,
    input_page: page,
  });
  const users = data ?? [];
  const total = Number(users[0]?.total_count ?? 0);
  const href = (next: { role?: string; page?: number }) => {
    const params = new URLSearchParams();
    const selectedRole = next.role ?? role;
    if (selectedRole !== "all") params.set("role", selectedRole);
    if (query) params.set("q", query);
    if ((next.page ?? 1) > 1) params.set("page", String(next.page));
    const text = params.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        {role !== "all" ? <input name="role" type="hidden" value={role} /> : null}
        <label className="space-y-1.5 text-sm font-medium" htmlFor="user-search">
          {t("search")}
          <Input defaultValue={query} id="user-search" name="q" placeholder={t("searchPlaceholder")} />
        </label>
        <button
          className="h-9 rounded-4xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          type="submit"
        >
          {t("searchAction")}
        </button>
      </form>
      <nav aria-label={t("roleFilter")} className="flex flex-wrap gap-2">
        {roleFilters.map((value) => (
          <Link
            aria-current={role === value ? "page" : undefined}
            className={
              role === value
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border bg-white px-3 py-1.5 text-sm font-semibold"
            }
            href={href({ role: value })}
            key={value}
          >
            {t(`roles.${value}`)}
          </Link>
        ))}
      </nav>
      {error ? (
        <p role="alert">{t("loadError")}</p>
      ) : users.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3" scope="col">
                  {t("columns.user")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.household")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.joined")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.role")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr className="align-top" key={user.user_id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{user.display_name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {user.household_name ?? "—"}
                    {user.household_permission ? (
                      <p className="text-xs text-muted-foreground">
                        {t(`householdRoles.${user.household_permission}`)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(user.created_at, locale)}</td>
                  <td className="px-4 py-3">
                    <ActionForm
                      action={setUserRoleAction.bind(null, locale, user.user_id)}
                      confirmMessage={t("roleConfirm")}
                      inline
                      pendingLabel={t("saving")}
                      size="sm"
                      submitLabel={t("apply")}
                      variant="outline"
                    >
                      <label className="sr-only" htmlFor={`role-${user.user_id}`}>
                        {t("columns.role")}
                      </label>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        defaultValue={user.role === "content_editor" ? "member" : user.role}
                        id={`role-${user.user_id}`}
                        name="role"
                      >
                        {assignableRoles.map((value) => (
                          <option key={value} value={value}>
                            {t(`roles.${value}`)}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 25 ? (
        <nav aria-label={t("pagination")} className="flex justify-between">
          {page > 1 ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={href({ page: page - 1 })}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {page * 25 < total ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={href({ page: page + 1 })}
            >
              {t("next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
