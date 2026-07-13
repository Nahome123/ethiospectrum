"use client";

import { Heart, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

const photos = [
  {
    id: "classroom",
    src: "/images/family/classroom.jpg",
    alt: "classroomAlt",
    className: "family-photo-main",
  },
  {
    id: "outdoors",
    src: "/images/family/outdoors.jpg",
    alt: "outdoorsAlt",
    className: "family-photo-outdoors",
  },
  {
    id: "learning",
    src: "/images/family/learning.jpg",
    alt: "learningAlt",
    className: "family-photo-learning",
  },
] as const;

export function FamilyPhotoGallery() {
  const t = useTranslations("hero");
  const [unavailable, setUnavailable] = useState<string[]>([]);

  return (
    <section aria-label={t("galleryLabel")} className="relative overflow-hidden bg-[#e5f0ef] py-16 sm:py-20">
      <div className="family-orbit family-orbit-one" aria-hidden="true" />
      <div className="family-orbit family-orbit-two" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div className="max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary-foreground">
            {t("galleryLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t("galleryTitle")}
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{t("galleryDescription")}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-primary shadow-sm">
            <Heart aria-hidden="true" className="size-4 fill-accent text-accent" />
            <span>{t("trust")}</span>
          </div>
        </div>
        <div className="family-photo-stage" aria-label={t("galleryLabel")}>
          {photos.map((photo, index) => {
            const missing = unavailable.includes(photo.id);
            return (
              <article className={`family-photo-card ${photo.className}`} key={photo.id}>
                {missing ? (
                  <div className="family-photo-fallback">
                    <Sparkles aria-hidden="true" className="size-7 text-primary" />
                    <span>{t(photo.alt)}</span>
                  </div>
                ) : (
                  <img
                    src={photo.src}
                    alt={t(photo.alt)}
                    onError={() => setUnavailable((current) => [...new Set([...current, photo.id])])}
                  />
                )}
                <span aria-hidden="true" className="family-photo-index">
                  0{index + 1}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
