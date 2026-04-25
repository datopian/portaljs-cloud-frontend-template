import { Group, Organization, Tag } from "@portaljs/ckan";
import { Resource } from "./resource.interface";

export interface Dataset {
    author?: string;
    author_email?: string;
    creator_user_id?: string;
    id: string;
    isopen?: boolean;
    license_id?: string;
    license_title?: string;
    license_url?: string;
    maintainer?: string;
    maintainer_email?: string;
    metadata_created?: string;
    metadata_modified?: string;
    name: string;
    notes?: string;
    num_resources: number;
    num_tags: number;
    owner_org?: string;
    private?: boolean;
    state?: "active" | "inactive" | "deleted";
    title?: string;
    type?: "dataset" | "visualization";
    external_url?: string;
    url?: string;
    version?: string;
    resources: Array<Resource>;
    organization?: Organization;
    groups?: Array<Group>;
    tags?: Array<Tag>;
    sources?: Array<{ url: string; title: string }>;
    temporal_coverage_start?: string;
    temporal_coverage_end?: string;
    coverage_type?: string;
    data_type?: string;
    source?: string[];
}

export interface PackageSearchOptions {
    offset: number;
    limit: number;
    groups: Array<string>;
    orgs: Array<string>;
    tags: Array<string>;
    query?: string;
    resFormat?: Array<string>;
    sort?: string;
    include_private?: boolean;
    fq?: string;
    type?: string;
}

export interface PackageFacetOptions {
    name:string;
    display_name:string;
    count:number;
}
