# PortalJS Frontend Starter

<div align="center">

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/datopian/portaljs-frontend-starter)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Next.js 13+](https://img.shields.io/badge/Next.js-13%2B-black?logo=next.js&logoColor=white)](https://nextjs.org/) [![GitHub Stars](https://img.shields.io/github/stars/datopian/portaljs?style=social)](https://github.com/datopian/portaljs/stargazers)

**A modern, customizable frontend template for building high-performance CKAN-based data portals**

Powered by **[Next.js](https://nextjs.org)**, **[React](https://react.dev/)**, and **[Tailwind CSS](https://tailwindcss.com/)**

**[🚀 Live Demo](https://demo.portaljs.com/) • [📖 Documentation](https://portaljs.com/docs) • [☁️ PortalJS Cloud](https://cloud.portaljs.com/) • [🌐 Website](https://portaljs.com/)**

</div>

---

## Overview

This is the official frontend template used by [PortalJS Cloud](https://cloud.portaljs.com) — a fully managed data portal service built on top of CKAN and Next.js.

Use it to:

- Build decoupled CKAN frontends with modern tools (Next.js, React, TailwindCSS)
- Customize dataset views, branding, and layouts
- Deploy on Vercel, Netlify, Cloudflare Pages or your own infra

## ✨ Features

- **Modern UI** - Clean, responsive design with Tailwind CSS
- **High Performance** - Built on Next.js 13+ with SSR/SSG
- **CKAN Integration** - Seamless data fetching via @portaljs/ckan
- **TypeScript** - Full type safety and better DX
- **Easy Customizatio**n - Simple theme system and component styling
- **Mobile-First** - Responsive design for all devices
- **Deploy Ready** - One-click deployment to Vercel

## Getting started

### Option 1: PortalJS Cloud

PortalJS Cloud uses this template for creating new portals. If you want to quickly get started for free, follow the steps:

1. **Sign up** at <https://cloud.portaljs.com>
2. **Create portal** → PortalJS Cloud will auto-generate a GitHub repository for your portal (based on this template) and deploy it automatically
3. Find the repo link in your PortalJS Cloud dashboard
4. **Customize** your portal via pull requests — or let us take care of it by reaching out at portaljs@datopian.com

### Option 2: Self-Hosted / Standalone

> [!note]
> In standalone mode, you are going to need your own dedicated CKAN instance.

In order to use this repository in standalone mode (i.e. without PortalJS Cloud), click on the "Use this template" button on the top right corner to replicate this code to a new repo.

Then, you can start customizing it locally by following the development instructions bellow, and/or deploy it somewhere such as on Vercel.

### Development

1) Clone this repository

2) Install the dependencies with `npm i`

3) Create a new `.env` file with:

```bash
# This is the URL of the CKAN instance. Use the example value if you are using PortalJS Cloud.
NEXT_PUBLIC_DMS=https://api.cloud.portaljs.com/@my-portal-main-org-name

# Optional Queryless AI assistant integration
# Set to true to display the floating AI button + right drawer chat
NEXT_PUBLIC_QUERYLESS_ENABLED=false

# Optional internal API route path used by the chat widget
NEXT_PUBLIC_QUERYLESS_API_ROUTE=/api/queryless-chat

# Server-side Queryless API config (keep these non-public)
QUERYLESS_URL=
QUERYLESS_TOKEN=
QUERYLESS_MODEL=agent:your-agent-id
```

4) Run `npm run dev` to start the development server

5) Access `http://localhost:3000` in your browser

## Customization

This template was developed with Next.js/React and TailwindCSS.

In order to learn more about how it can be customized, check the following documentations:

- https://react.dev/
- https://nextjs.org/docs
- https://v3.tailwindcss.com/docs/installation

### Quick Customizations

#### Logo Customization

```tsx
// components/_shared/PortalDefaultLogo.tsx
export default function PortalDefaultLogo() {
  return (
    <Link href="/">
      <img src="/your-logo.png" alt="Your Portal" height={55} />
    </Link>
  );
}
```

#### Footer Links

```tsx
// components/_shared/Footer.tsx - Update navigation object
const navigation = {
  about: [
    { name: "About Us", href: "/about" },
    { name: "Contact", href: "/contact" },
  ],
  useful: [
    { name: "Datasets", href: "/search" },
    { name: "Organizations", href: "/organizations" },
  ],
  social: [
    { name: "twitter", href: "https://twitter.com/yourhandle" },
    { name: "email", href: "mailto:contact@yoursite.com" },
  ],
};
```

#### Homepage Content

```tsx
// pages/index.tsx - Update title and description
<Head>
  <title>Your Portal Name</title>
  <meta name="description" content="Your portal description" />
</Head>
```

##### Dataset Search

```tsx
// lib/queries/dataset.ts - Add custom facet fields
const facetFields = [
  "groups",
  "organization",
  "res_format",
  "tags",           // Enable tags
  "license_id",     // Add license filtering
]
```

#### Theme Components

```tsx
// themes/default/index.tsx - Replace with custom components
const DefaultTheme = {
  header: CustomHeader,
  footer: CustomFooter,
  layout: DefaultThemeLayout,
};
```

---

## Tech Stack

- **Framework:** [Next.js 13+](https://nextjs.org/) with TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Data:** [CKAN API](https://docs.ckan.org/en/2.10/api/) via [@portaljs/ckan](https://www.npmjs.com/package/@portaljs/ckan)
- **Deployment:** [Vercel](https://vercel.com/)

## Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdatopian%2Fportaljs-frontend-starter&env=NEXT_PUBLIC_DMS&envDescription=DMS%20endpoint%2C%20e.g.%2C%20a%20CKAN%20instance%20URL.%20For%20testing%20purposes%2C%20you%20can%20use%20https%3A%2F%2Fapi.cloud.portaljs.com%2F&project-name=my-portaljs-app&repository-name=my-portaljs-app)

1. Push your repo to GitHub
2. Connect it on [vercel.com](https://vercel.com/)
3. Add environment variables
4. Deploy! 🎉

#### Other Platforms

This template works on:
- **Netlify** - Connect your GitHub repo
- **Cloudflare Pages** - Import from Git
- **Your server** - `npm run build && npm start`

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork** this repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Need help or advanced features?

This template covers basic portal functionality. For complex customizations, integrations, or enterprise features, [contact our team](mailto:portaljs@datopian.com) for professional services.

- **Custom Design** - Tailored branding and UI/UX
- **Advanced Features** - Custom integrations and functionality
- **Enterprise Support** - Dedicated support and SLA
- **Migration** - Help moving from existing portals

---

<div align="center">

**Built with ❤️ by [Datopian](https://datopian.com/)**

Let’s build better data portals together 🚀

**⭐️ [Star PortalJS](https://github.com/datopian/portaljs) • [🐦 Follow us](https://www.linkedin.com/company/10340373) • [💬 Contact](mailto:portaljs@datopian.com)**

**[📚 Docs](https://portaljs.com/docs) • [ 🐛 Report a bug or suggest an idea](https://github.com/datopian/portaljs/issues)**

</div>
