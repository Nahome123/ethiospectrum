import type { RbtSourceElement, RbtSourceNode } from "@/features/training/rbt/types";

function sourceClasses(node: RbtSourceElement): string {
  if (node.tag === "h1") return "font-heading text-3xl font-black leading-tight sm:text-5xl";
  if (node.tag === "li")
    return "grid gap-2 border-b border-dashed border-[#dde8e2] py-3 last:border-0 sm:grid-cols-2 sm:gap-5";
  if (node.tag === "strong") return "font-bold";
  if (node.tag === "u") return "underline decoration-2 underline-offset-2";

  switch (node.className) {
    case "hero":
      return "relative overflow-hidden rounded-4xl bg-linear-to-br from-[#1a6b3c] via-[#0d4a27] to-[#1a1a2e] px-5 py-12 text-center text-white shadow-lg sm:px-10";
    case "flag-stripe":
      return "mb-6 flex justify-center gap-0";
    case "g":
      return "h-1.5 w-10 rounded-full bg-[#2d9a5a]";
    case "y":
      return "h-1.5 w-10 rounded-full bg-[#f0c84a]";
    case "r":
      return "h-1.5 w-10 rounded-full bg-[#b5251e]";
    case "hero-badge":
      return "mb-5 inline-block rounded-full border border-[#f0c84a]/50 bg-[#c8982a]/25 px-4 py-1.5 text-xs font-semibold tracking-[0.15em] text-[#f0c84a] uppercase";
    case "am":
      return "font-medium text-[#1a6b3c]";
    case "hero-sub":
      return "mt-3 text-sm text-white/80";
    case "section-card":
      return "mb-7 rounded-3xl border border-[#dde8e2] border-l-5 border-l-[#1a6b3c] bg-white p-5 shadow-sm sm:p-8";
    case "section-card gold":
      return "mb-7 rounded-3xl border border-[#dde8e2] border-l-5 border-l-[#c8982a] bg-white p-5 shadow-sm sm:p-8";
    case "section-card red":
      return "mb-7 rounded-3xl border border-[#dde8e2] border-l-5 border-l-[#b5251e] bg-white p-5 shadow-sm sm:p-8";
    case "section-title":
      return "font-heading text-2xl font-bold text-[#1a6b3c]";
    case "section-title gold":
      return "font-heading text-2xl font-bold text-[#9a721f]";
    case "section-title red":
      return "font-heading text-2xl font-bold text-[#b5251e]";
    case "section-title-am":
      return "mb-5 mt-1 text-base font-semibold text-muted-foreground";
    case "bi-item":
      return "grid gap-2 border-b border-[#dde8e2] py-3 last:border-0 sm:grid-cols-2 sm:gap-5";
    case "bi-en":
      return "font-medium text-foreground";
    case "bi-am":
      return "font-medium text-[#1a6b3c]";
    case "bi-list":
      return "my-3 list-none";
    case "en":
      return "text-sm text-foreground";
    case "highlight-box":
      return "my-4 rounded-2xl border border-[#b2d8c2] bg-[#e8f5ee] p-5";
    case "steps-row":
      return "my-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
    case "step-box":
      return "rounded-2xl bg-[#1a6b3c] p-5 text-center text-white";
    case "step-box transfer":
      return "rounded-2xl bg-[#c8982a] p-5 text-center text-white";
    case "step-box distract":
      return "rounded-2xl bg-[#2563a8] p-5 text-center text-white";
    case "step-box check":
      return "rounded-2xl bg-[#b5251e] p-5 text-center text-white";
    case "step-num":
      return "font-heading text-4xl font-black text-white/35";
    case "step-name":
      return "mt-1 text-lg font-bold tracking-wide";
    case "step-am":
      return "mt-1 text-sm text-white/90";
    case "step-desc":
      return "mt-2 text-xs leading-5 text-white/85";
    case "divider":
      return "my-6 flex items-center gap-3 text-center text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border";
    case "error-flow":
      return "my-4 flex flex-wrap items-center gap-2 font-bold";
    case "ef-box":
      return "rounded-xl bg-[#b5251e] px-3 py-2 text-sm text-white";
    case "ef-box green":
      return "rounded-xl bg-[#1a6b3c] px-3 py-2 text-sm text-white";
    case "ef-box gold":
      return "rounded-xl bg-[#c8982a] px-3 py-2 text-sm text-white";
    case "ef-box blue":
      return "rounded-xl bg-[#2563a8] px-3 py-2 text-sm text-white";
    case "ef-arrow":
      return "text-lg text-muted-foreground";
    case "qa-card":
      return "mb-4 rounded-2xl border border-[#dde8e2] bg-white p-5 shadow-sm";
    case "qa-q":
      return "font-semibold text-foreground";
    case "qa-a":
      return "mt-3 font-bold text-[#1a6b3c]";
    case "qa-am":
      return "mt-3 border-t border-[#dde8e2] pt-3 text-sm text-muted-foreground";
    case "gloss-item":
      return "border-b border-[#dde8e2] py-4 last:border-0";
    case "gloss-term":
      return "font-semibold text-foreground";
    case "gloss-def":
      return "mt-1 text-sm text-muted-foreground";
    case "gloss-def-am":
      return "mt-1 text-sm text-muted-foreground";
    case "takeaway-grid":
      return "mt-3 grid gap-4 md:grid-cols-2";
    case "takeaway-item":
      return "rounded-2xl border-l-4 border-[#1a6b3c] bg-[#e8f5ee] p-5";
    default:
      return "";
  }
}

function languageFor(node: RbtSourceElement): "am" | "en" | undefined {
  if (node.className?.includes("am")) return "am";
  if (node.className?.includes("en")) return "en";
  return undefined;
}

export function RbtSourceNodeRenderer({
  node,
  omittedClasses,
}: {
  node: RbtSourceNode;
  omittedClasses?: readonly string[];
}) {
  if (node.kind === "text") return node.value;
  if (node.className && omittedClasses?.includes(node.className)) return null;

  const props = { className: sourceClasses(node), lang: languageFor(node) };
  const children = node.children.map((child, index) => (
    <RbtSourceNodeRenderer key={index} node={child} omittedClasses={omittedClasses} />
  ));

  switch (node.tag) {
    case "div":
      return <div {...props}>{children}</div>;
    case "span":
      return <span {...props}>{children}</span>;
    case "h1":
      return <h1 {...props}>{children}</h1>;
    case "p":
      return <p {...props}>{children}</p>;
    case "ul":
      return <ul {...props}>{children}</ul>;
    case "li":
      return <li {...props}>{children}</li>;
    case "strong":
      return <strong {...props}>{children}</strong>;
    case "u":
      return <u {...props}>{children}</u>;
    case "button":
      return (
        <button type="button" {...props}>
          {children}
        </button>
      );
    case "footer":
      return <footer {...props}>{children}</footer>;
  }
}
