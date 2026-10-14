import Image from "next/image";
import { getTranslations } from "next-intl/server";
import founderPhoto from "@/public/images/team/founder-yamrot.jpg";
import secondMemberPhoto from "@/public/images/team/team-member-2.jpg";
import thirdMemberPhoto from "@/public/images/team/team-member-3.jpg";

const teamMembers = [
  { key: "second", photo: secondMemberPhoto },
  { key: "third", photo: thirdMemberPhoto },
] as const;

/**
 * About Us: the founder, then the rest of the team. Empty titles are not
 * shown; an empty name or bio shows a "coming soon" placeholder.
 */
export async function AboutUsSection() {
  const t = await getTranslations("aboutUs");
  const title = t("founderTitle").trim();
  const bio = t("founderBio").trim();

  return (
    <section aria-labelledby="about-heading" className="scroll-mt-24 bg-white py-16 sm:py-20" id="about">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16 lg:px-8">
        <div className="mx-auto w-full max-w-xs lg:max-w-none">
          <div className="overflow-hidden rounded-3xl border-8 border-secondary shadow-lg">
            <Image
              alt={t("photoAlt")}
              className="aspect-[4/5] h-auto w-full object-cover object-top"
              placeholder="blur"
              sizes="(min-width: 1024px) 22rem, 20rem"
              src={founderPhoto}
            />
          </div>
        </div>
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary-foreground">
            {t("eyebrow")}
          </p>
          <h2
            className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            id="about-heading"
          >
            {t("title")}
          </h2>
          <div className="mt-8 border-l-4 border-accent pl-5">
            <p className="text-2xl font-bold text-foreground">{t("founderName")}</p>
            {title ? <p className="mt-1 font-semibold text-link">{title}</p> : null}
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("founderRole")}
            </p>
          </div>
          <p
            className={`mt-6 text-lg leading-8 ${bio ? "text-muted-foreground" : "italic text-muted-foreground/80"}`}
          >
            {bio || t("bioPlaceholder")}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 className="text-2xl font-bold tracking-tight text-foreground">{t("teamHeading")}</h3>
        <ul className="mt-8 grid gap-10 sm:grid-cols-2">
          {teamMembers.map(({ key, photo }) => {
            const name = t(`team.${key}.name`).trim();
            const memberTitle = t(`team.${key}.title`).trim();
            const memberBio = t(`team.${key}.bio`).trim();
            return (
              <li className="grid items-start gap-5 sm:grid-cols-[10rem_1fr]" key={key}>
                <div className="mx-auto w-40 overflow-hidden rounded-3xl border-4 border-secondary shadow-md sm:mx-0">
                  <Image
                    alt={name ? t("memberPhotoAlt", { name }) : t("memberPhotoAltUnnamed")}
                    className="aspect-[4/5] h-auto w-full object-cover object-top"
                    placeholder="blur"
                    sizes="10rem"
                    src={photo}
                  />
                </div>
                <div>
                  <div className="border-l-4 border-accent pl-4">
                    <p
                      className={`text-xl font-bold ${name ? "text-foreground" : "italic text-muted-foreground/80"}`}
                    >
                      {name || t("namePlaceholder")}
                    </p>
                    {memberTitle ? <p className="mt-1 font-semibold text-link">{memberTitle}</p> : null}
                  </div>
                  <p
                    className={`mt-4 leading-7 ${memberBio ? "text-muted-foreground" : "italic text-muted-foreground/80"}`}
                  >
                    {memberBio || t("bioPlaceholder")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
