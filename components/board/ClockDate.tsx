type ClockDateProps = {
  time: string;
  date: string;
};

export function ClockDate({ time, date }: ClockDateProps) {
  return (
    <div className="text-right">
      <div className="text-4xl font-black leading-none text-white sm:text-5xl lg:text-[3.25rem]">{time}</div>
      <div className="mt-1 text-xs font-semibold tracking-[0.14em] text-slate-400 sm:text-sm">{date}</div>
    </div>
  );
}
