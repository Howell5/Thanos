import { motion } from "framer-motion";

const features = [
  {
    icon: "⚡",
    title: "Lightning Fast",
    description: "Built on modern technologies like Hono and React for blazing fast performance.",
  },
  {
    icon: "🔐",
    title: "Authentication Ready",
    description:
      "Secure authentication with Better Auth. Email, social logins, and session management included.",
  },
  {
    icon: "💳",
    title: "Payments Built-in",
    description:
      "Stripe integration with webhooks, credit systems, and checkout flows ready to go.",
  },
  {
    icon: "🎨",
    title: "Beautiful UI",
    description:
      "Clean, minimal design with dark mode support. Built with Tailwind CSS and shadcn/ui.",
  },
  {
    icon: "📊",
    title: "Type-Safe",
    description: "End-to-end type safety with TypeScript. From database to frontend, fully typed.",
  },
  {
    icon: "🚀",
    title: "Deploy Anywhere",
    description: "Ready for deployment on Vercel, Railway, Zeabur, or any platform you prefer.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export function Features() {
  return (
    <section className="border-t py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h2
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Everything you need
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            A complete foundation for your next SaaS product. Stop reinventing the wheel.
          </motion.p>
        </div>

        <motion.div
          className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              className="group relative rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/50"
              variants={itemVariants}
            >
              <div className="mb-4 text-4xl">{feature.icon}</div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
