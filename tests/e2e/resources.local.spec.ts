import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;
const isDedicatedLocalRun =
  process.env.E2E_DOCUMENTS_LOCAL_CONFIG === "1" &&
  process.env.E2E_LOCAL_SUPABASE === "1" &&
  localSupabaseUrl.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const password = "Local-resource-test-password-123!";
const createdResourceIds: string[] = [];
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

function localAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !localSupabaseUrl.test(url)) {
    throw new Error("The dedicated local resource test configuration is incomplete.");
  }
  return createClient(url, secret);
}

function localReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("The local anonymous reader configuration is incomplete.");
  return createClient(url, key);
}

function setSyntheticAppRole(userId: string, role: "member" | "content_editor" | "administrator") {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid synthetic actor identifier.");
  runLocalSql("update public.user_roles set role=:'role' where user_id=:'user_id'", {
    role,
    user_id: userId,
  });
}

function runLocalSql(sql: string, variables: Record<string, string> = {}) {
  const variableArguments = Object.entries(variables).flatMap(([name, value]) => ["-v", `${name}=${value}`]);
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_ethiospectrum-web",
      "psql",
      "--set=ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      ...variableArguments,
    ],
    { encoding: "utf8", input: `${sql};\n`, stdio: ["pipe", "pipe", "pipe"] },
  );
}

async function createActor(role: "member" | "content_editor" | "administrator", label: string) {
  const admin = localAdmin();
  const suffix = `${Date.now()}-${randomUUID()}`;
  const email = `resource-${label}-${suffix}@example.test`;
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Synthetic", last_name: label, preferred_locale: "en" },
  });
  if (result.error || !result.data.user) throw new Error(`Could not create synthetic ${label}.`);
  createdUserIds.push(result.data.user.id);
  setSyntheticAppRole(result.data.user.id, role);
  return { id: result.data.user.id, email };
}

async function login(page: Page, email: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === "en" ? "Email address" : /@/).fill(email);
  await page
    .getByLabel(locale === "en" ? "Password" : /./)
    .last()
    .fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(`/${locale}/(?:dashboard|onboarding)$`)),
    page.getByRole("button", { name: locale === "en" ? "Log in" : /.+/ }).click(),
  ]);
}

type TranslationFixture = {
  locale: "am" | "es";
  title: string;
  summary: string;
  body: string;
  reviewStatus?: "draft" | "in_review" | "approved";
  sourceVersion?: number;
  submittedBy?: string | null;
};

async function createResourceFixture({
  authorId,
  slug,
  englishTitle,
  englishSummary = "A synthetic canonical English summary that is long enough for browser validation.",
  englishBody = "A synthetic canonical English body that is deliberately long enough for browser validation and safe rendering.",
  category = "education",
  status = "published",
  resourceType = "article",
  featuredRank = null,
  translations = [],
}: {
  authorId: string;
  slug: string;
  englishTitle: string;
  englishSummary?: string;
  englishBody?: string;
  category?: "education" | "healthcare";
  status?: "draft" | "in_review" | "published" | "archived";
  resourceType?: "article" | "guide" | "video" | "template" | "event_recap";
  featuredRank?: number | null;
  translations?: TranslationFixture[];
}) {
  const resourceId = randomUUID();
  const published = status === "published";
  const archived = status === "archived";
  runLocalSql(
    `insert into public.resources
      (id,slug,category,status,author_id,updated_by,published_by,published_at,first_published_at,archived_by,archived_at,version,resource_type,featured_rank)
     values
      (:'resource_id',:'slug',:'category',:'status',:'author_id',:'author_id',
       case when :'published'='1' then :'author_id'::uuid else null end,
       case when :'published'='1' then now() else null end,
       case when :'published'='1' then now() else null end,
       case when :'archived'='1' then :'author_id'::uuid else null end,
       case when :'archived'='1' then now() else null end,1,:'resource_type',nullif(:'featured_rank','')::smallint)`,
    {
      resource_id: resourceId,
      slug,
      category,
      status,
      author_id: authorId,
      published: published ? "1" : "0",
      archived: archived ? "1" : "0",
      resource_type: resourceType,
      featured_rank: String(featuredRank ?? ""),
    },
  );
  createdResourceIds.push(resourceId);
  const rows = [
    {
      resource_id: resourceId,
      locale: "en",
      title: englishTitle,
      summary: englishSummary,
      body: englishBody,
      review_status: "approved",
      version: 1,
      source_translation_version: null,
      created_by: authorId,
      updated_by: authorId,
      submitted_by: null,
      reviewed_by: authorId,
      reviewed_at: new Date().toISOString(),
      review_note: null,
    },
    ...translations.map((translation) => ({
      resource_id: resourceId,
      locale: translation.locale,
      title: translation.title,
      summary: translation.summary,
      body: translation.body,
      review_status: translation.reviewStatus ?? "approved",
      version: 1,
      source_translation_version: translation.sourceVersion ?? 1,
      created_by: authorId,
      updated_by: authorId,
      submitted_by: translation.submittedBy ?? null,
      submitted_at: translation.submittedBy ? new Date().toISOString() : null,
      reviewed_by: translation.reviewStatus === "approved" ? authorId : null,
      reviewed_at: translation.reviewStatus === "approved" ? new Date().toISOString() : null,
      review_note: translation.reviewStatus === "draft" ? "Synthetic internal review note" : null,
    })),
  ];
  for (const row of rows) {
    runLocalSql(
      `insert into public.resource_translations
        (resource_id,locale,title,summary,body,review_status,version,source_translation_version,
         created_by,updated_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_note)
       values
        (:'resource_id',:'locale',:'title',:'summary',:'body',:'review_status',1,
         nullif(:'source_version','')::integer,
         :'created_by',:'created_by',
         nullif(:'submitted_by','')::uuid,
         case when :'submitted_by'='' then null else now() end,
         nullif(:'reviewed_by','')::uuid,
         case when :'reviewed_by'='' then null else now() end,
         case when :'review_note'='' then null else :'review_note' end)`,
      {
        resource_id: row.resource_id,
        locale: row.locale,
        title: row.title,
        summary: row.summary,
        body: row.body,
        review_status: row.review_status,
        source_version: String(row.source_translation_version ?? ""),
        created_by: row.created_by,
        submitted_by: row.submitted_by ?? "",
        reviewed_by: row.reviewed_by ?? "",
        review_note: row.review_note ?? "",
      },
    );
  }
  return { id: resourceId, slug };
}

async function createHouseholdFixture(ownerId: string, name: string) {
  const householdId = randomUUID();
  runLocalSql(
    "insert into public.households(id,primary_owner_id,created_by,name) values (:'id',:'owner_id',:'owner_id',:'name')",
    { id: householdId, owner_id: ownerId, name },
  );
  createdHouseholdIds.push(householdId);
  runLocalSql(
    "insert into public.household_members(household_id,user_id,permission,status,joined_at) values (:'household_id',:'user_id','owner','active',now())",
    { household_id: householdId, user_id: ownerId },
  );
  return householdId;
}

async function addHouseholdRole(
  householdId: string,
  userId: string,
  permission: "administrator" | "member" | "viewer",
) {
  runLocalSql(
    "insert into public.household_members(household_id,user_id,permission,status,joined_at) values (:'household_id',:'user_id',:'permission','active',now())",
    { household_id: householdId, user_id: userId, permission },
  );
}

async function expectEditorDenied(browser: Browser, email: string, resourceId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  await page.goto(`/en/editor/resources/${resourceId}/translations?role=content_editor`);
  await expect(page).toHaveURL(/\/en\/auth-error\?reason=access-denied$/);
  await page.reload();
  await expect(page).toHaveURL(/\/en\/auth-error\?reason=access-denied$/);
  await context.close();
}

test.describe("resource translations (local Supabase only)", () => {
  test.skip(
    !isDedicatedLocalRun,
    "Resource translation coverage requires the dedicated local configuration.",
  );
  test.setTimeout(240_000);

  test.afterEach(async () => {
    const admin = localAdmin();
    for (const resourceId of createdResourceIds.splice(0)) {
      runLocalSql("delete from public.resources where id=:'id'", { id: resourceId });
    }
    for (const householdId of createdHouseholdIds.splice(0)) {
      runLocalSql("delete from public.households where id=:'id'", { id: householdId });
    }
    for (const userId of createdUserIds.splice(0)) await admin.auth.admin.deleteUser(userId);
  });

  test("selects safe localized public content, fallbacks, Markdown, and mobile layouts", async ({ page }) => {
    const author = await createActor("administrator", "public-author");
    const suffix = randomUUID().slice(0, 8);
    const current = await createResourceFixture({
      authorId: author.id,
      slug: `localized-${suffix}`,
      englishTitle: `English public title ${suffix}`,
      englishBody:
        "# Safe heading\n\n- First safe item\n- Second safe item\n\n```js\nalert('literal code')\n```\n\n[Safe HTTPS link](https://example.com/resource) and [Safe HTTP link](http://example.com/plain)\n\n<script>alert('unsafe')</script>\n\n<img src=x onerror=alert(1)>\n\n<a href=\"javascript:alert(1)\">click</a>\n\n[unsafe](javascript:alert(1)) and [unsafe data](data:text/html,alert(1))\n\nየአማርኛ ይዘት Español con acentos and enough additional safe text.",
      translations: [
        {
          locale: "am",
          title: `የአማርኛ ርዕስ ${suffix}`,
          summary: "ይህ ለሕዝብ ሙከራ የሚያገለግል በቂ የአማርኛ ማጠቃለያ ነው።",
          body: "ይህ ለሕዝብ አንባቢ ሙከራ የሚያገለግል በቂ ርዝመት ያለው የአማርኛ ይዘት ነው። ተጨማሪ ይዘት።",
        },
        {
          locale: "es",
          title: `Título público en español ${suffix}`,
          summary: "Este resumen público en español es suficientemente largo para la prueba.",
          body: "Este cuerpo público en español tiene longitud suficiente para probar la selección localizada y los acentos.",
        },
      ],
    });
    const fallback = await createResourceFixture({
      authorId: author.id,
      slug: `fallback-${suffix}`,
      englishTitle: `English fallback title ${suffix}`,
    });
    const healthcare = await createResourceFixture({
      authorId: author.id,
      slug: `healthcare-${suffix}`,
      category: "healthcare",
      englishTitle: `Healthcare filter title ${suffix}`,
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `draft-am-${suffix}`,
      englishTitle: `Draft Amharic fallback ${suffix}`,
      translations: [
        {
          locale: "am",
          title: `Hidden draft Amharic ${suffix}`,
          summary: "Draft Amharic summary that must remain private from readers.",
          body: "Draft Amharic body that must remain private and is long enough for the database content constraint.",
          reviewStatus: "draft",
        },
      ],
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `stale-es-${suffix}`,
      englishTitle: `Stale Spanish fallback ${suffix}`,
      translations: [
        {
          locale: "es",
          title: `Hidden stale Spanish ${suffix}`,
          summary: "A stale Spanish summary that must never be selected publicly.",
          body: "A stale Spanish body that must never be selected publicly and is long enough for storage.",
          sourceVersion: 99,
        },
      ],
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `in-review-translations-${suffix}`,
      englishTitle: `In-review translation fallback ${suffix}`,
      translations: [
        {
          locale: "am",
          title: `Hidden in-review Amharic ${suffix}`,
          summary: "An in-review Amharic summary that must remain private from public readers.",
          body: "An in-review Amharic body that must remain private and is long enough for the database content constraint.",
          reviewStatus: "in_review",
          submittedBy: author.id,
        },
        {
          locale: "es",
          title: `Hidden in-review Spanish ${suffix}`,
          summary: "An in-review Spanish summary that must remain private from public readers.",
          body: "An in-review Spanish body that must remain private and is long enough for the database content constraint.",
          reviewStatus: "in_review",
          submittedBy: author.id,
        },
      ],
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `mixed-private-translations-${suffix}`,
      englishTitle: `Draft Spanish and stale Amharic fallback ${suffix}`,
      translations: [
        {
          locale: "am",
          title: `Hidden stale Amharic ${suffix}`,
          summary: "A stale Amharic summary that must never be selected publicly.",
          body: "A stale Amharic body that must never be selected publicly and is long enough for storage.",
          sourceVersion: 99,
        },
        {
          locale: "es",
          title: `Hidden draft Spanish ${suffix}`,
          summary: "A draft Spanish summary that must never be selected publicly.",
          body: "A draft Spanish body that must never be selected publicly and is long enough for storage.",
          reviewStatus: "draft",
        },
      ],
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `unpublished-${suffix}`,
      englishTitle: `Hidden unpublished title ${suffix}`,
      status: "draft",
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `in-review-parent-${suffix}`,
      englishTitle: `Hidden in-review parent title ${suffix}`,
      status: "in_review",
    });
    await createResourceFixture({
      authorId: author.id,
      slug: `archived-${suffix}`,
      englishTitle: `Hidden archived title ${suffix}`,
      status: "archived",
    });

    const readerSelection = await localReader().rpc("list_published_resources", {
      input_locale: "en",
      input_category: null,
    });
    if (readerSelection.error) {
      throw new Error(`Local reader RPC failed: ${readerSelection.error.message}`);
    }
    if (!readerSelection.data?.some((row: { slug: string }) => row.slug === current.slug)) {
      const fixtureState = runLocalSql(
        "select r.status,r.archived_at,t.locale,t.review_status,t.version from public.resources r join public.resource_translations t on t.resource_id=r.id where r.id=:'id' order by t.locale",
        { id: current.id },
      );
      throw new Error(`Anonymous reader did not receive the published fixture. ${fixtureState}`);
    }

    await page.goto("/en/resources");
    await expect(page.getByRole("heading", { level: 1, name: "Trusted resources" })).toBeVisible();
    await expect(page.getByRole("link", { name: `English public title ${suffix}` })).toBeVisible();
    await expect(page.getByText(`Hidden unpublished title ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(`Hidden in-review parent title ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(`Hidden archived title ${suffix}`)).toHaveCount(0);
    await page.getByRole("link", { name: `English public title ${suffix}` }).click();
    await expect(page).toHaveURL(new RegExp(`/en/resources/${current.slug}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: `English public title ${suffix}` }),
    ).toBeVisible();
    await expect(page.getByText("This resource is not yet available", { exact: false })).toHaveCount(0);
    await expect(page.locator("article script")).toHaveCount(0);
    await expect(page.locator("article img")).toHaveCount(0);
    await expect(page.locator("article [onerror]")).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="data:"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Safe heading" })).toBeVisible();
    await expect(page.locator("article ul").getByText("First safe item", { exact: true })).toBeVisible();
    await expect(page.locator("article code")).toHaveText("alert('literal code')");
    const safeLink = page.getByRole("link", { name: "Safe HTTPS link" });
    await expect(safeLink).toHaveAttribute("href", "https://example.com/resource");
    await expect(safeLink).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("link", { name: "Safe HTTP link" })).toHaveAttribute(
      "href",
      "http://example.com/plain",
    );
    await expect(page.getByText(/<script>alert/)).toBeVisible();
    await expect(page.getByText(/<img src=x onerror/)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/resources$/);
    await page.goto("/en/resources?category=healthcare");
    await expect(page.getByRole("link", { name: `Healthcare filter title ${suffix}` })).toBeVisible();
    await expect(page.getByRole("link", { name: `English public title ${suffix}` })).toHaveCount(0);
    await page.goto("/en/resources?page=999999");
    await expect(page.getByRole("link", { name: `Healthcare filter title ${suffix}` })).toBeVisible();
    await page.goto(`/en/resources/${healthcare.slug}`);
    await expect(page.getByRole("heading", { name: `Healthcare filter title ${suffix}` })).toBeVisible();

    await page.goto(`/am/resources/${current.slug}`);
    await expect(page.getByRole("heading", { name: `የአማርኛ ርዕስ ${suffix}` })).toBeVisible();
    await expect(page.getByText("ይህ መርጃ በአማርኛ ገና አልተገኘም።")).toHaveCount(0);
    await page.reload();
    await page.goto(`/am/resources/${fallback.slug}`);
    await expect(page.getByRole("heading", { name: `English fallback title ${suffix}` })).toBeVisible();
    await expect(page.getByText(/የእንግሊዝኛ ቅጹ ይታያል/)).toBeVisible();
    await expect(page.getByText(`Título público en español ${suffix}`)).toHaveCount(0);

    await page.goto(`/es/resources/${current.slug}`);
    await expect(page.getByRole("heading", { name: `Título público en español ${suffix}` })).toBeVisible();
    await expect(page.getByText("Este recurso aún no está disponible en español.")).toHaveCount(0);
    await page.goto(`/es/resources/${fallback.slug}`);
    await expect(page.getByText(/Se muestra la versión en inglés/)).toBeVisible();
    await expect(page.getByText(`የአማርኛ ርዕስ ${suffix}`)).toHaveCount(0);

    await page.goto(`/am/resources/draft-am-${suffix}`);
    await expect(page.getByRole("heading", { name: `Draft Amharic fallback ${suffix}` })).toBeVisible();
    await expect(page.getByText(`Hidden draft Amharic ${suffix}`)).toHaveCount(0);
    await page.goto(`/es/resources/stale-es-${suffix}`);
    await expect(page.getByRole("heading", { name: `Stale Spanish fallback ${suffix}` })).toBeVisible();
    await expect(page.getByText(`Hidden stale Spanish ${suffix}`)).toHaveCount(0);
    for (const [locale, slug, hiddenTitle] of [
      ["am", `in-review-translations-${suffix}`, `Hidden in-review Amharic ${suffix}`],
      ["es", `in-review-translations-${suffix}`, `Hidden in-review Spanish ${suffix}`],
      ["am", `mixed-private-translations-${suffix}`, `Hidden stale Amharic ${suffix}`],
      ["es", `mixed-private-translations-${suffix}`, `Hidden draft Spanish ${suffix}`],
    ] as const) {
      await page.goto(`/${locale}/resources/${slug}`);
      await expect(page.getByText(hiddenTitle)).toHaveCount(0);
      await expect(
        page.getByText(locale === "am" ? /የእንግሊዝኛ ቅጹ ይታያል/ : /Se muestra la versión en inglés/),
      ).toBeVisible();
    }

    const unknown = await page.goto(`/en/resources/unknown-${suffix}`);
    expect(unknown?.status()).toBe(404);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/am/resources");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(
      page.getByText(/review_status|source_translation_version|Synthetic internal review note/),
    ).toHaveCount(0);
    await expect(page.getByText(current.id)).toHaveCount(0);
  });

  test("supports member discovery, private bookmarks, roadmap links, and administrator curation", async ({
    browser,
  }) => {
    const administrator = await createActor("administrator", "discovery-admin");
    const member = await createActor("member", "discovery-member");
    await createHouseholdFixture(member.id, `Discovery household ${randomUUID()}`);
    const suffix = randomUUID().slice(0, 8);
    const resource = await createResourceFixture({
      authorId: administrator.id,
      slug: `member-discovery-${suffix}`,
      englishTitle: `Member discovery guide ${suffix}`,
      englishSummary: "A synthetic reviewed guide for member discovery and roadmap browser testing.",
      resourceType: "guide",
      featuredRank: 9,
    });
    runLocalSql(
      "insert into public.resource_account_access(resource_id,user_id,assigned_by) values (:'resource_id',:'user_id',:'assigned_by')",
      { assigned_by: administrator.id, resource_id: resource.id, user_id: member.id },
    );

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, member.email);
    await memberPage.goto("/en/member/resources");
    await expect(
      memberPage.getByRole("heading", { name: "Discover trusted guidance for your next step." }),
    ).toBeVisible();
    const forYou = memberPage.getByRole("region", { name: "Selected for you" });
    await expect(forYou.getByRole("link", { name: `Member discovery guide ${suffix}` })).toBeVisible();
    await expect(forYou.getByText("Guide", { exact: true }).first()).toBeVisible();

    await Promise.all([
      memberPage.waitForURL(new RegExp(`/en/member/resources/${resource.slug}$`)),
      forYou.getByRole("link", { name: `Member discovery guide ${suffix}` }).click(),
    ]);
    await expect(memberPage.getByText("Selected for you", { exact: true })).toBeVisible();
    await memberPage.getByRole("button", { name: "Save this resource", exact: true }).click();
    await expect(memberPage.getByText("Resource saved.")).toBeVisible();
    await memberPage.getByRole("button", { name: "Add to roadmap" }).click();
    await expect(memberPage.getByText("Resource added to your roadmap.")).toBeVisible();

    await memberPage.goto("/en/member/resources?bookmarked=1");
    await expect(memberPage.getByRole("link", { name: `Member discovery guide ${suffix}` })).toBeVisible();
    await memberPage.goto("/en/roadmap");
    await expect(memberPage.getByText(`Member discovery guide ${suffix}`).first()).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, administrator.email);
    await adminPage.goto(`/en/admin/resources/${resource.id}`);
    await adminPage.getByLabel("Resource type").selectOption("video");
    await adminPage.getByLabel("Featured position").fill("3");
    await adminPage.getByRole("button", { name: "Save discovery settings" }).click();
    await expect(adminPage.getByText("Saved.")).toBeVisible();

    await memberPage.goto("/en/member/resources?featured=1");
    const featuredCard = memberPage
      .getByRole("article")
      .filter({ has: memberPage.getByRole("link", { name: `Member discovery guide ${suffix}` }) });
    await expect(featuredCard.getByText("Video", { exact: true })).toBeVisible();
    await expect(featuredCard.getByRole("link", { name: `Member discovery guide ${suffix}` })).toBeVisible();
    await adminContext.close();
    await memberContext.close();
  });

  test("offers the protected bilingual IEP and 504 accommodations guide from Resources", async ({ page }) => {
    await page.goto("/en/member/resources/iep-504-accommodations");
    await expect(page).toHaveURL(/\/en\/login\?next=/);

    const member = await createActor("member", "iep-accommodations-reader");
    await login(page, member.email);
    await page.goto("/en/member/resources");
    const guideLink = page.getByRole("link", { name: "Open accommodations guide" });
    await expect(guideLink).toHaveAttribute("href", "/en/member/resources/iep-504-accommodations");
    await guideLink.click();

    await expect(
      page.getByRole("heading", { name: "Example Accommodations for IEPs and 504s" }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Reading progress" })).toBeVisible();
    await expect(page.locator("#iep-accommodations-content > section")).toHaveCount(18);
    await expect(page.locator("#iep-accommodations-content tbody tr")).toHaveCount(187);
    await expect(page.locator('a[href="#classroom-learning-environment"]').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await page.goto("/am/member/resources/iep-504-accommodations");
    await expect(page.getByRole("link", { name: "ወደ የትምህርት ቤተ-መጻሕፍት ተመለስ" })).toBeVisible();
    await page.goto("/es/member/resources/iep-504-accommodations");
    await expect(page.getByRole("link", { name: "Volver a la biblioteca de aprendizaje" })).toBeVisible();
  });

  test("enforces global editor authorization and household isolation", async ({ browser, page }) => {
    const platformAdmin = await createActor("administrator", "platform-admin");
    const editor = await createActor("content_editor", "editor-isolated");
    const owner = await createActor("member", "household-owner");
    const householdAdmin = await createActor("member", "household-admin");
    const member = await createActor("member", "household-member");
    const viewer = await createActor("member", "household-viewer");
    const householdName = `Private synthetic household ${randomUUID()}`;
    const householdId = await createHouseholdFixture(owner.id, householdName);
    await addHouseholdRole(householdId, householdAdmin.id, "administrator");
    await addHouseholdRole(householdId, member.id, "member");
    await addHouseholdRole(householdId, viewer.id, "viewer");
    const resource = await createResourceFixture({
      authorId: platformAdmin.id,
      slug: `authorization-${randomUUID()}`,
      englishTitle: "Authorization resource",
    });

    await page.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(page).toHaveURL(/\/en\/login\?next=/);
    for (const actor of [owner, householdAdmin, member, viewer]) {
      await expectEditorDenied(browser, actor.email, resource.id);
    }

    for (const actor of [editor, platformAdmin]) {
      const context = await browser.newContext();
      const actorPage = await context.newPage();
      await login(actorPage, actor.email);
      await actorPage.goto(`/es/editor/resources/${resource.id}/translations`);
      await expect(actorPage).toHaveURL(new RegExp(`/es/editor/resources/${resource.id}/translations$`));
      await expect(
        actorPage.getByRole("heading", { name: /Resource translations|Traducciones/ }),
      ).toBeVisible();
      await expect(actorPage.getByText(/Estado del recurso principal: Publicado/)).toBeVisible();
      await expect(actorPage.getByText(householdName)).toHaveCount(0);
      await actorPage.goto(`/am/editor/resources/${resource.id}/translations`);
      await expect(actorPage).toHaveURL(new RegExp(`/am/editor/resources/${resource.id}/translations$`));
      const amharicHeading = actorPage.getByRole("heading", { level: 1 });
      await expect(amharicHeading).toBeVisible();
      expect(await amharicHeading.textContent()).not.toBe("Resource translations");
      expect((await actorPage.goto(`/en/editor/resources/${resource.id}/translations/fr`))?.status()).toBe(
        404,
      );
      expect(
        (await actorPage.goto(`/en/editor/resources/${resource.id}/translations/en/edit`))?.status(),
      ).toBe(404);
      await context.close();
    }

    const isolatedContext = await browser.newContext();
    const isolatedPage = await isolatedContext.newPage();
    await login(isolatedPage, editor.email);
    for (const route of ["/en/dependents", "/en/documents", "/en/roadmap", "/en/reminders"]) {
      await isolatedPage.goto(route);
      await expect(isolatedPage.getByText(householdName)).toHaveCount(0);
    }
    await isolatedPage.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(isolatedPage.getByRole("heading", { name: "Resource translations" })).toBeVisible();
    await expect(
      isolatedPage.getByText(
        /machine translation|automatic translation|translation provider|translator assignment|translation billing|translation memory|glossary/i,
      ),
    ).toHaveCount(0);
    await isolatedPage.setViewportSize({ width: 390, height: 844 });
    expect(await isolatedPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await isolatedContext.close();

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await login(readerPage, owner.email);
    await readerPage.goto("/en/resources");
    await expect(readerPage.getByRole("link", { name: "Authorization resource" })).toBeVisible();
    await readerContext.close();
  });

  test("preserves the ETH-023 English resource workflow", async ({ browser }) => {
    const author = await createActor("administrator", "regression-author");
    const reviewer = await createActor("administrator", "regression-reviewer");
    const suffix = randomUUID().slice(0, 8);
    const slug = `english-regression-${suffix}`;
    const updatedTitle = `Updated English regression ${suffix}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, author.email);
    await pageA.goto("/en/admin/resources/new");
    await pageA.getByLabel("URL slug").fill(slug);
    await pageA.getByLabel("Category").selectOption("education");
    await pageA.getByLabel("Title").fill(`English regression ${suffix}`);
    await pageA
      .getByLabel("Summary")
      .fill("A synthetic English regression summary that is long enough for validation.");
    await pageA
      .getByLabel("Resource content")
      .fill(
        "# Initial English heading\n\nThis synthetic English regression body is long enough for workflow validation.",
      );
    await pageA.getByLabel("Feature for members").selectOption({ label: "Synthetic regression-author" });
    await pageA.getByRole("button", { name: "Create draft" }).press("Enter");
    await pageA.waitForURL(/\/en\/admin\/resources\/[0-9a-f-]{36}$/i);
    const resourceId = pageA.url().split("/").at(-1);
    if (!resourceId || !/^[0-9a-f-]{36}$/i.test(resourceId)) throw new Error("Missing created resource ID.");
    createdResourceIds.push(resourceId);
    await pageA.getByRole("link", { name: "Edit resource" }).click();
    await pageA.getByLabel("Title").fill(updatedTitle);
    await pageA
      .getByLabel("Resource content")
      .fill(
        "# Updated English heading\n\n- Safe regression item\n- Another safe item\n\nThis body remains safe and long enough for publication.",
      );
    await pageA.getByRole("button", { name: "Save draft" }).press("Enter");
    await pageA.waitForURL(new RegExp(`/en/admin/resources/${resourceId}$`));
    await expect(pageA.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await pageA.getByRole("button", { name: "Submit for review" }).press("Enter");
    await expect(pageA.getByRole("button", { name: "Approve" })).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, reviewer.email);
    await pageB.goto(`/en/admin/resources/${resourceId}/review`);
    await expect(pageB.getByRole("heading", { level: 2, name: updatedTitle })).toBeVisible();
    await pageB.getByRole("button", { name: "Approve" }).press("Enter");
    await expect(pageB.getByRole("button", { name: "Publish" })).toBeVisible();
    await pageB.getByRole("button", { name: "Publish" }).press("Enter");
    await expect(pageB.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await pageB.goto(`/en/resources/${slug}`);
    await expect(pageB.getByRole("heading", { level: 1, name: updatedTitle })).toBeVisible();
    await expect(pageB.getByRole("heading", { level: 2, name: "Updated English heading" })).toBeVisible();
    await expect(
      pageB.locator("article ul").getByText("Safe regression item", { exact: true }),
    ).toBeVisible();

    await pageB.goto(`/en/admin/resources/${resourceId}`);
    await pageB.getByRole("button", { name: "Unpublish" }).press("Enter");
    await expect(pageB.getByRole("button", { name: "Submit for review" })).toBeVisible();
    await pageB.getByRole("link", { name: "Edit resource" }).click();
    await pageB.getByLabel("URL slug").fill(`${slug}-changed`);
    await pageB.getByRole("button", { name: "Save draft" }).press("Enter");
    await expect(
      pageB.getByRole("alert").filter({ hasText: "We could not save this resource. Please try again." }),
    ).toBeVisible();
    await pageB.goto(`/en/admin/resources/${resourceId}`);
    await pageB.getByRole("button", { name: "Archive" }).press("Enter");
    await expect(pageB.getByRole("button", { name: "Restore" })).toBeVisible();
    await pageB.getByRole("button", { name: "Restore" }).press("Enter");
    await expect(pageB.getByRole("button", { name: "Submit for review" })).toBeVisible();
    expect((await pageB.goto(`/en/resources/${slug}`))?.status()).toBe(404);
    await contextA.close();
    await contextB.close();
  });

  test("completes Amharic and Spanish workflows with separate reviewers", async ({ browser }) => {
    const administrator = await createActor("administrator", "workflow-admin");
    const editorA = await createActor("content_editor", "editor-a");
    const editorB = await createActor("content_editor", "editor-b");
    const resource = await createResourceFixture({
      authorId: administrator.id,
      slug: `workflow-${randomUUID()}`,
      englishTitle: "Workflow canonical English",
    });
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, editorA.email);
    await pageA.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(pageA.getByRole("heading", { name: "Resource translations" })).toBeVisible();
    await expect(pageA.getByText("Parent resource status: Published", { exact: true })).toBeVisible();
    await expect(pageA.getByText("English source version: 1", { exact: true })).toBeVisible();
    await expect(pageA.getByText("Not started", { exact: true })).toHaveCount(4);
    await expect(pageA.getByText(/Invalid Date|\d{4}-\d{2}-\d{2}T/)).toHaveCount(0);

    const workflows = [
      {
        locale: "am" as const,
        title: "የሙከራ አማርኛ ርዕስ",
        summary: "ይህ ለአማርኛ የስራ ፍሰት ሙከራ የሚያገለግል በቂ ማጠቃለያ ነው።",
        body: "# የአማርኛ ርዕስ\n\nይህ ለፍጠር፣ አርትዕ፣ ማስገባት እና ማጽደቅ ሙከራ በቂ ርዝመት ያለው ይዘት ነው።",
        publicNotice: /የእንግሊዝኛ ቅጹ ይታያል/,
      },
      {
        locale: "es" as const,
        title: "Guía española de prueba",
        summary: "Este resumen español con acentos es suficientemente largo para probar el flujo.",
        body: "# Guía española\n\nEste contenido español es suficientemente largo para crear, editar, enviar y aprobar la traducción.",
        publicNotice: /Se muestra la versión en inglés/,
      },
    ];

    for (const workflow of workflows) {
      const approvedTitle = `${workflow.title} — updated`;
      await pageA.goto(`/en/editor/resources/${resource.id}/translations/${workflow.locale}/edit`);
      await expect(pageA.getByRole("heading", { name: "Canonical English source" })).toBeVisible();
      await expect(
        pageA.getByRole("form", {
          name: workflow.locale === "am" ? "Amharic translation" : "Spanish translation",
        }),
      ).toBeVisible();
      await pageA.getByLabel("Title").fill(workflow.title);
      await pageA.getByLabel("Summary").fill(workflow.summary);
      await pageA.getByLabel("Translation Markdown body").fill(workflow.body);
      await expect(pageA.getByRole("heading", { name: "Markdown preview" })).toBeVisible();
      await pageA.getByRole("button", { name: "Create translation" }).press("Enter");
      await expect(pageA.getByRole("status")).toHaveText("Saved.");
      await pageA.goto(`/en/editor/resources/${resource.id}/translations/${workflow.locale}`);
      await pageA.getByRole("link", { name: "Edit translation" }).click();
      await expect(pageA.getByLabel("Title")).toHaveValue(workflow.title);
      await pageA.getByLabel("Title").fill(approvedTitle);
      await pageA.getByRole("button", { name: "Save translation" }).press("Enter");
      await expect(pageA.getByRole("status")).toHaveText("Saved.");
      await pageA.goto(`/en/editor/resources/${resource.id}/translations/${workflow.locale}`);
      await pageA.getByRole("button", { name: "Submit translation" }).press("Enter");
      await expect(pageA.getByText("You cannot review your own translation.")).toBeVisible();
      await expect(pageA.getByRole("button", { name: "Approve" })).toHaveCount(0);
      await pageA.goto(`/en/editor/resources/${resource.id}/translations`);
      await expect(pageA.getByText("In review", { exact: true })).toBeVisible();
      await expect(pageA.getByText(/Invalid Date|\d{4}-\d{2}-\d{2}T/)).toHaveCount(0);

      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      await login(pageB, editorB.email);
      await pageB.goto(`/en/editor/resources/${resource.id}/translations/${workflow.locale}/review`);
      await expect(pageB.getByText("Workflow canonical English", { exact: true })).toBeVisible();
      await expect(pageB.getByText(approvedTitle, { exact: true })).toBeVisible();
      await pageB.getByRole("button", { name: "Approve" }).press("Enter");
      await expect(pageB.getByRole("listitem").filter({ hasText: /^approved ·/ })).toBeVisible();
      await contextB.close();

      const publicPage = await contextA.newPage();
      await publicPage.goto(`/${workflow.locale}/resources/${resource.slug}`);
      await expect(publicPage.getByRole("heading", { name: approvedTitle })).toBeVisible();
      await expect(publicPage.getByText(workflow.publicNotice)).toHaveCount(0);
      await expect(publicPage.getByText(editorB.id)).toHaveCount(0);
      await publicPage.close();
    }

    await pageA.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(pageA.getByText("Approved", { exact: true })).toHaveCount(2);
    await contextA.close();
  });

  test("withdraws and rejects translations with private review notes", async ({ browser }) => {
    const administrator = await createActor("administrator", "branch-admin");
    const editorA = await createActor("content_editor", "branch-editor-a");
    const editorB = await createActor("content_editor", "branch-editor-b");
    const rejectionNote = "Synthetic reviewer note that must remain private to resource editors.";
    const resource = await createResourceFixture({
      authorId: administrator.id,
      slug: `branches-${randomUUID()}`,
      englishTitle: "Translation branch canonical English",
      translations: [
        {
          locale: "am",
          title: "የማስወገድ ሙከራ የአማርኛ ርዕስ",
          summary: "ይህ ለማስወገድ የስራ ፍሰት ሙከራ የሚያገለግል በቂ የአማርኛ ማጠቃለያ ነው።",
          body: "ይህ በስራ ፍሰት ሙከራ ውስጥ መሰረዝን ለማረጋገጥ በቂ ርዝመት ያለው የአማርኛ ይዘት ነው።",
          reviewStatus: "in_review",
          submittedBy: editorA.id,
        },
        {
          locale: "es",
          title: "Traducción española para rechazo",
          summary: "Este resumen español permite probar de forma segura el flujo de rechazo.",
          body: "Este contenido español tiene longitud suficiente para probar una nota de rechazo privada y el retorno al borrador.",
          reviewStatus: "in_review",
          submittedBy: editorA.id,
        },
      ],
    });

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, editorA.email);
    await pageA.goto(`/en/editor/resources/${resource.id}/translations/am`);
    await expect(pageA.getByText("You cannot review your own translation.")).toBeVisible();
    await pageA.getByRole("button", { name: "Withdraw" }).press("Enter");
    await expect(pageA.getByRole("link", { name: "Edit translation" })).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, editorB.email);
    await pageB.goto(`/en/editor/resources/${resource.id}/translations/es/review`);
    const rejectionField = pageB.getByLabel("Rejection note");
    await rejectionField.fill("Too short");
    await pageB.getByRole("button", { name: "Reject" }).click();
    await expect(rejectionField).toBeVisible();
    expect(await rejectionField.evaluate((field: HTMLTextAreaElement) => field.validity.tooShort)).toBe(true);
    await rejectionField.fill(rejectionNote);
    await pageB.getByRole("button", { name: "Reject" }).press("Enter");
    await expect(pageB.getByRole("link", { name: "Edit translation" })).toBeVisible();
    await pageB.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(pageB.getByText("Draft", { exact: true })).toHaveCount(2);
    await pageB.goto(`/es/resources/${resource.slug}`);
    await expect(pageB.getByRole("heading", { name: "Translation branch canonical English" })).toBeVisible();
    await expect(pageB.getByText(rejectionNote)).toHaveCount(0);
    await expect(pageB.getByText("Traducción española para rechazo")).toHaveCount(0);
    await contextA.close();
    await contextB.close();
  });

  test("invalidates translated sources and preserves parent lifecycle records", async ({ browser }) => {
    const administrator = await createActor("administrator", "lifecycle-admin");
    const reviewer = await createActor("content_editor", "lifecycle-reviewer");
    const resource = await createResourceFixture({
      authorId: administrator.id,
      slug: `lifecycle-${randomUUID()}`,
      englishTitle: "Original lifecycle English",
      translations: [
        {
          locale: "am",
          title: "የቀድሞ የአማርኛ ርዕስ",
          summary: "ይህ ከእንግሊዝኛ ለውጥ በኋላ መቆየት ያለበት በቂ የአማርኛ ማጠቃለያ ነው።",
          body: "ይህ ከእንግሊዝኛ ምንጭ ለውጥ በኋላ በአርታዒ በኩል መቆየት ያለበት በቂ የአማርኛ ይዘት ነው።",
        },
        {
          locale: "es",
          title: "Título español anterior",
          summary: "Este resumen español debe conservarse después del cambio de la fuente inglesa.",
          body: "Este contenido español debe conservarse en el editor después del cambio de la fuente inglesa.",
        },
      ],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, administrator.email);
    await page.goto(`/en/admin/resources/${resource.id}`);
    await page.getByRole("button", { name: "Unpublish" }).press("Enter");
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
    await expect(page.getByText(/^Draft · Draft$/)).toBeVisible();
    await page.getByRole("link", { name: "Edit resource" }).click();
    await page.getByLabel("Title").fill("Updated lifecycle English");
    await page.getByRole("button", { name: "Save draft" }).press("Enter");
    await page.waitForURL(new RegExp(`/en/admin/resources/${resource.id}$`));
    await expect(page.getByRole("heading", { name: "Updated lifecycle English" })).toBeVisible();
    await page.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(page.getByText("Stale", { exact: true })).toHaveCount(2);
    await expect(page.getByText("የቀድሞ የአማርኛ ርዕስ", { exact: true })).toHaveCount(0);
    await page.goto(`/en/editor/resources/${resource.id}/translations/am`);
    await expect(page.getByRole("alert").filter({ hasText: "Translation is outdated" })).toBeVisible();
    await expect(page.getByText("የቀድሞ የአማርኛ ርዕስ", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Submit translation" }).press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "We could not update this translation. Please try again." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Edit translation" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("የቀድሞ የአማርኛ ርዕስ");

    await page.goto(`/en/admin/resources/${resource.id}`);
    for (const [action, nextAction] of [
      ["Submit for review", "Approve"],
      ["Approve", "Publish"],
      ["Publish", "Unpublish"],
    ] as const) {
      await page.getByRole("button", { name: action }).press("Enter");
      await expect(page.getByRole("button", { name: nextAction })).toBeVisible();
    }
    await page.goto(`/am/resources/${resource.slug}`);
    await expect(page.getByRole("heading", { name: "Updated lifecycle English" })).toBeVisible();
    await expect(page.getByText(/የእንግሊዝኛ ቅጹ ይታያል/)).toBeVisible();
    await expect(page.getByText("የቀድሞ የአማርኛ ርዕስ")).toHaveCount(0);
    await page.goto(`/es/resources/${resource.slug}`);
    await expect(page.getByText(/Se muestra la versión en inglés/)).toBeVisible();

    await page.goto(`/en/editor/resources/${resource.id}/translations/am/edit`);
    await page.getByLabel("Title").fill("የታደሰ የአማርኛ ርዕስ");
    await page.getByRole("button", { name: "Save translation" }).press("Enter");
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await page.goto(`/en/editor/resources/${resource.id}/translations/am`);
    await page.getByRole("button", { name: "Submit translation" }).press("Enter");
    await expect(page.getByText("You cannot review your own translation.")).toBeVisible();
    const reviewerContext = await browser.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await login(reviewerPage, reviewer.email);
    await reviewerPage.goto(`/en/editor/resources/${resource.id}/translations/am/review`);
    await reviewerPage.getByRole("button", { name: "Approve" }).press("Enter");
    await expect(reviewerPage.getByRole("listitem").filter({ hasText: /^approved ·/ })).toBeVisible();
    await reviewerContext.close();
    await page.goto(`/am/resources/${resource.slug}`);
    await expect(page.getByRole("heading", { name: "የታደሰ የአማርኛ ርዕስ" })).toBeVisible();

    await page.goto(`/en/admin/resources/${resource.id}`);
    await page.getByRole("button", { name: "Unpublish" }).press("Enter");
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
    for (const locale of ["en", "am", "es"] as const) {
      expect((await page.goto(`/${locale}/resources/${resource.slug}`))?.status()).toBe(404);
    }
    await page.goto(`/en/admin/resources/${resource.id}`);
    await page.getByRole("button", { name: "Archive" }).press("Enter");
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(page.getByText(/^Archived · Draft$/)).toBeVisible();
    await page.goto(`/en/editor/resources/${resource.id}/translations`);
    await expect(page.getByText("Parent resource status: Archived", { exact: true })).toBeVisible();
    expect((await page.goto(`/en/editor/resources/${resource.id}/translations/am/edit`))?.status()).toBe(404);
    await page.goto(`/en/admin/resources/${resource.id}`);
    await page.getByRole("button", { name: "Restore" }).press("Enter");
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
    await expect(page.getByText(/^Draft · Draft$/)).toBeVisible();
    expect((await page.goto(`/en/resources/${resource.slug}`))?.status()).toBe(404);
    await page.goto(`/en/admin/resources/${resource.id}`);
    for (const [action, nextAction] of [
      ["Submit for review", "Approve"],
      ["Approve", "Publish"],
      ["Publish", "Unpublish"],
    ] as const) {
      await page.getByRole("button", { name: action }).press("Enter");
      await expect(page.getByRole("button", { name: nextAction })).toBeVisible();
    }
    await page.goto(`/am/resources/${resource.slug}`);
    await expect(page.getByRole("heading", { name: "የታደሰ የአማርኛ ርዕስ" })).toBeVisible();
    await page.goto(`/es/resources/${resource.slug}`);
    await expect(page.getByText(/Se muestra la versión en inglés/)).toBeVisible();
    await context.close();
  });
});
