import Head from "next/head";

import Layout from "@/components/_shared/Layout";

export default function TermsAndConditionsPage(): JSX.Element {
  return (
    <>
      <Head>
        <title>AI Terms of Use</title>
        <meta
          name="description"
          content="Terms of use for the AI assistant on this website."
        />
      </Head>

      <Layout>
        <main className="custom-container py-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h1 className="text-3xl font-semibold text-slate-900">
              AI Terms of Use
            </h1>
            <div className="mt-6 space-y-4 text-sm leading-7 text-slate-700 md:text-base">
              <p>
                By using the AI on this website, you accept that AI-generated
                responses can contain mistakes, omissions, or outdated
                information.
              </p>
              <p>
                You are responsible for checking important information before
                relying on it for decisions, compliance, legal matters,
                financial matters, medical matters, or any other high-impact
                use.
              </p>
              <p>
                The owners of this website, along with their vendors and
                suppliers, are not legally liable for AI-generated responses,
                including any inaccuracies, misinterpretations, or resulting
                losses.
              </p>
            </div>
          </div>
        </main>
      </Layout>
    </>
  );
}
