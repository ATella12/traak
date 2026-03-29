import Link from "next/link";

type OptionCardProps = {
  href: string;
  title: string;
  description: string;
};

export default function OptionCard({ href, title, description }: OptionCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
      <p className="mt-4 text-sm font-medium text-cyan-300 transition group-hover:text-cyan-200">Continue</p>
    </Link>
  );
}
