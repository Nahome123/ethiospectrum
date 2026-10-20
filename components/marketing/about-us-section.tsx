import { ChevronDown } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import { getTranslations } from "next-intl/server";
import founderPhoto from "@/public/images/team/founder-yamrot.jpg";
import secondMemberPhoto from "@/public/images/team/team-member-2.jpg";
import thirdMemberPhoto from "@/public/images/team/team-member-3.jpg";

type Member = { id: string; name: string; title: string; bio: string; photo: StaticImageData; alt: string };

/**
 * About Us: three equal cards. Each shows a photo, name, role and the first
 * paragraph of the bio; "Read more" opens the rest. An empty name or bio
 * shows a "coming soon" placeholder.
 */
export async function AboutUsSection() {
  const t = await getTranslations("aboutUs");
  const memberAlt = (name: string) => (name ? t("memberPhotoAlt", { name }) : t("memberPhotoAltUnnamed"));
  const members: Member[] = [
    {
      id: "yamrot",
      name: t("founderName").trim(),
      title: [t("founderTitle").trim(), t("founderRole").trim()].filter(Boolean).join(" · "),
      bio: t("founderBio").trim(),
      photo: founderPhoto,
      alt: t("photoAlt"),
    },
    ...(
      [
        ["second", secondMemberPhoto],
        ["third", thirdMemberPhoto],
      ] as const
    ).map(([key, photo]) => {
      const name = t(`team.${key}.name`).trim();
      return {
        id: key,
        name,
        title: t(`team.${key}.title`).trim(),
        bio: t(`team.${key}.bio`).trim(),
        photo,
        alt: memberAlt(name),
      };
    }),
  ];

  return (
    <section aria-labelledby="about-heading" className="scroll-mt-24 bg-white py-16 sm:py-20" id="about">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary-foreground">
            {t("eyebrow")}
          </p>
          <h2
            className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            id="about-heading"
          >
            {t("title")}
          </h2>
        </div>

        <ul className="mt-12 grid items-start gap-8 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const [first, ...rest] = (member.bio || t("bioPlaceholder")).split(/\n\s*\n/);
            return (
              <li
                className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
                key={member.id}
              >
                <Image
                  alt={member.alt}
                  className="aspect-[4/5] h-auto w-full object-cover object-top"
                  placeholder="blur"
                  sizes="(min-width: 1024px) 24rem, (min-width: 768px) 50vw, 100vw"
                  src={member.photo}
                />
                <div className="flex flex-1 flex-col p-6">
                  <div className="border-l-4 border-accent pl-4">
                    <h3
                      className={`text-xl font-bold ${member.name ? "text-foreground" : "italic text-muted-foreground/80"}`}
                    >
                      {member.name || t("namePlaceholder")}
                    </h3>
                    {member.title ? <p className="mt-1 font-semibold text-link">{member.title}</p> : null}
                  </div>
                  <p
                    className={`mt-4 leading-7 ${member.bio ? "text-muted-foreground" : "italic text-muted-foreground/80"}`}
                  >
                    {first}
                  </p>
                  {rest.length > 0 ? (
                    <details className="group mt-3">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md font-semibold text-link outline-none focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">{t("readMore")}</span>
                        <span className="hidden group-open:inline">{t("showLess")}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <div className="mt-3 space-y-4 leading-7 text-muted-foreground">
                        {rest.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
