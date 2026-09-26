import Link from "next/link";

export type CoreModule =
  | "usage"
  | "saving"
  | "budget"
  | "ai-activity"
  | "efficiency";

type CoreModuleEntry = {
  key: CoreModule;
  label: string;
  href: string;
};

const CORE_MODULES: CoreModuleEntry[] = [
  { key: "usage", label: "Usage", href: "/usage" },
  { key: "saving", label: "Saving", href: "/saving" },
  { key: "budget", label: "Budget", href: "/budget" },
  { key: "ai-activity", label: "AI Activity", href: "/ai-activity" },
  { key: "efficiency", label: "Efficiency", href: "/efficiency" },
];

const BASE_CLASS =
  "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors";

const ACTIVE_CLASS = `${BASE_CLASS} bg-[#f0eeff] text-[#5146d9]`;

const IDLE_CLASS = `${BASE_CLASS} text-[#667085] hover:bg-[#f4f4f7] hover:text-[#344054]`;

export default function CoreModuleNav({ active }: { active: CoreModule }) {
  return (
    <div
      role="navigation"
      aria-label="Core modules"
      className="mb-4 flex flex-wrap items-center gap-1.5"
    >
      {CORE_MODULES.map((mod) => {
        const isActive = mod.key === active;

        return (
          <Link
            key={mod.key}
            href={mod.href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? ACTIVE_CLASS : IDLE_CLASS}
          >
            {mod.label}
          </Link>
        );
      })}
    </div>
  );
}
