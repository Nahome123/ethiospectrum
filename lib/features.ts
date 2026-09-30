import "server-only";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { isFeatureEnabled, type RetiredFeature } from "@/config/features";

/** Retired routes render the standard not-found page. */
export function requireFeature(feature: RetiredFeature): void {
  if (!isFeatureEnabled(feature)) notFound();
}

/** Retired API routes answer 404 before doing any work. */
export function retiredApiResponse(feature: RetiredFeature): NextResponse | null {
  return isFeatureEnabled(feature) ? null : new NextResponse(null, { status: 404 });
}
