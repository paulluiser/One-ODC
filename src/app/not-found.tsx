import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="state-page">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This space is still uncharted.</h1>
      <p>The page may have moved, or the address may be incorrect.</p>
      <Button asChild>
        <Link href="/">Back to One ODC</Link>
      </Button>
    </main>
  );
}
