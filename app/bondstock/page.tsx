import Link from "next/link";

const categories = [
  {
    href: "/bond-stock/boutique",
    title: "Boutique",
    emoji: "🛍️",
    desc: "Boutique items — SKUs, pallets, labels",
  },
  {
    href: "/bond-stock/lr",
    title: "Alcohol / LR",
    emoji: "🍾",
    desc: "Liquor & spirits items",
  },
  {
    href: "/bond-stock/cigarettes",
    title: "Cigarettes / CC",
    emoji: "🚬",
    desc: "Cigarettes & tobacco items",
  },
];

export default function BondStockHome() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-2">Bond Stock</h1>
      <p className="text-sm text-gray-500 mb-6">
        Select a category to manage
      </p>

      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
        {categories.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-xl border border-gray-200 bg-white p-6 hover:border-black hover:shadow-md transition"
          >
            <div className="text-3xl mb-3">{c.emoji}</div>
            <h2 className="text-lg font-semibold">{c.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}