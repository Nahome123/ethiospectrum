import source from "./content.json";

export type IepAccommodationItem = {
  en: string;
  am: string;
};

export type IepAccommodationSection = {
  id: string;
  index: number;
  title: string;
  titleAm: string;
  declaredCount: number;
  items: IepAccommodationItem[];
};

export type IepAccommodationsContent = {
  title: string;
  titleAm: string;
  tagline: string;
  taglineAm: string;
  introduction: string;
  introductionAm: string;
  stats: string[];
  colophon: string;
  sections: IepAccommodationSection[];
};

export const iepAccommodationsContent: IepAccommodationsContent = source;
