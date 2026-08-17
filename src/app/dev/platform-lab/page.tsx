import { notFound } from "next/navigation";
import { PlatformLab } from "@/client/platform-lab";

export default function PlatformLabPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_PLATFORM_LAB !== "true") notFound();
  return <PlatformLab />;
}
