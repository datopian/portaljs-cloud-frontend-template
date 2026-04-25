import { GetServerSideProps } from "next";
import OrgNavCrumbs from "@/components/organization/individualPage/OrgNavCrumbs";
import OrgInfo from "@/components/organization/individualPage/OrgInfo";
import Layout from "@/components/_shared/Layout";
import Tabs from "@/components/_shared/Tabs";
import styles from "styles/DatasetInfo.module.scss";
import DatasetList from "@/components/_shared/DatasetList";
import { getOrganization } from "@/lib/queries/orgs";
import { searchDatasets } from "@/lib/queries/dataset";

import HeroSection from "@/components/_shared/HeroSection";
import { OrganizationIndividualPageStructuredData } from "@/components/schema/OrganizationIndividualPageStructuredData";

export const getServerSideProps: GetServerSideProps = async (context) => {
  let orgName = context.params?.org as string;
  if (!orgName || !orgName.startsWith("@")) {
    return {
      notFound: true,
    };
  }
  orgName = orgName.split("@")[1];
  let org = await getOrganization({
    name: orgName as string,
    include_datasets: false,
  });

  console.log("Fetched organization:", org);

  let initialDatasets = null

  if (org.package_count) {
    initialDatasets = await searchDatasets({
      fq: `owner_org:${org.id}`,
      offset: 0,
      limit: 10,
      type: "dataset",
      query: "",
      sort: "metadata_modified desc",
      groups: [],
      orgs: [],
      tags: [],
      resFormat: [],
    });
  }
  if (!org) {
    return {
      notFound: true,
    };
  }
  return {
    props: {
      org,
      initialDatasets,
    },
  };
};

export default function OrgPage({ org, initialDatasets }): JSX.Element {
  const tabs = [
    {
      id: "datasets",
      content: (
        <DatasetList type="organization" name={org.id} initialDatasets={initialDatasets} />
      ),
      title: "Datasets",
    },
  ];
  return (
    <>
      <OrganizationIndividualPageStructuredData org={org} />
      {org && (
        <Layout>
          <HeroSection title={org.title} cols="6" />
          <OrgNavCrumbs
            org={{
              name: org?.name,
              title: org?.title,
            }}
          />
          <div className="grid mt-8 grid-rows-datasetpage-hero">
            <section className="grid row-start-2 row-span-2 col-span-full">
              <div className="custom-container">
                {org && (
                  <main className={styles.main}>
                    <OrgInfo org={org} />
                    <div>
                      <Tabs items={tabs} />
                    </div>
                  </main>
                )}
              </div>
            </section>
          </div>
        </Layout>
      )}
    </>
  );
}
