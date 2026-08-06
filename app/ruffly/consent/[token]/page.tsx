export default function RufflyConsentPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-[#1f2933]">
      <h1 className="text-3xl font-semibold tracking-tight">Message preferences</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        To stop Fitdog texts immediately, reply <strong>STOP</strong> to any message. Reply{" "}
        <strong>HELP</strong> for help. You can also call the front desk to update your contact preferences.
      </p>
    </main>
  );
}
