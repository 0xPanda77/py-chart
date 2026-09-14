import { Workbench } from "@/components/workbench";
import { availableProviders } from "@/lib/credentials";
import { shiftDate, todayInEt } from "@/lib/session";

// Which providers are usable depends on server env vars, so this page can't be
// prerendered at build time.
export const dynamic = "force-dynamic";

export default function Page() {
  const today = todayInEt();
  return (
    <>
      <header className="border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-100">Intraday Chart</h1>
        <p className="text-xs text-slate-500">
          1-minute candles for any US equity session, straight from the tape.
        </p>
      </header>
      <Workbench
        available={availableProviders()}
        today={today}
        // Massive's free plan is end-of-day, so today is never complete.
        // Default back far enough to always land on real data.
        defaultDay={shiftDate(today, -90)}
      />
    </>
  );
}
