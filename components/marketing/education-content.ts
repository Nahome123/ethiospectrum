import { BookOpen, CalendarDays, FileText, MessageCircleQuestion, ShieldCheck, Sparkles } from "lucide-react";

export const educationFeatureItems = [
  { action: "openGuide", href: "/resources/education#iep-guide", icon: BookOpen, key: "iepGuide" },
  { action: "startRoadmap", href: "/onboarding", icon: CalendarDays, key: "roadmap" },
  {
    action: "learnMore",
    href: "/resources/education#accommodations",
    icon: ShieldCheck,
    key: "accommodations",
  },
  { action: "learnMore", href: "/resources/education#eligibility", icon: FileText, key: "eligibility" },
  {
    action: "openGuide",
    href: "/resources/education#meeting-notes",
    icon: MessageCircleQuestion,
    key: "familyNotes",
  },
  { action: "learnMore", href: "/resources/education#language-support", icon: Sparkles, key: "multilingual" },
] as const;

export const educationArticleItems = [
  { href: "/resources/education#eligibility", key: "eligibility" },
  { href: "/resources/education#evaluation", key: "evaluation" },
  { href: "/resources/education#accommodations", key: "accommodations" },
] as const;

export const educationGuideItems = [
  { icon: BookOpen, id: "iep-guide", key: "iepGuide" },
  { icon: FileText, id: "eligibility", key: "eligibility" },
  { icon: FileText, id: "evaluation", key: "evaluation" },
  { icon: ShieldCheck, id: "accommodations", key: "accommodations" },
  { icon: CalendarDays, id: "meeting-notes", key: "meetingNotes" },
  { icon: Sparkles, id: "language-support", key: "autismSupport" },
] as const;
