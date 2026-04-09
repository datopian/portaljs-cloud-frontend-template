import Link from "next/link";
import { Resource, Tag } from "@portaljs/ckan";
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/20/solid";
import { getTimeAgo } from "@/lib/utils";
import { Dataset } from "@/schemas/dataset.interface";
import { RiExternalLinkLine } from "react-icons/ri";
import { useEffect, useRef, useState } from "react";
import MarkdownRenderer from "@/components/_shared/MarkdownRenderer";

function uniqueFormat(resources) {
  const formats = resources.map((item: Resource) => item.format);
  return [...new Set(formats)];
}

export default function DatasetInfo({ dataset }: { dataset: Dataset }) {
  const [isTruncated, setIsTruncated] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const description =
    dataset.notes?.replace(/<\/?[^>]+(>|$)/g, "") || "No description";

  const metaFormats = [
    { format: "jsonld", label: "JSON-LD" },
    { format: "rdf", label: "RDF" },
    { format: "ttl", label: "TTL" },
  ];

  const dmsUrl = process.env.NEXT_PUBLIC_DMS || "";
  const { dmsBaseUrl, dmsDatasetName } = (() => {
    if (!dmsUrl) {
      return { dmsBaseUrl: "", dmsDatasetName: dataset.name };
    }

    try {
      const url = new URL(dmsUrl);
      const orgPath = url.pathname.replace(/^\/+|\/+$/g, "");
      const orgName = orgPath.startsWith("@") ? orgPath.slice(1) : orgPath;

      return {
        dmsBaseUrl: url.origin,
        dmsDatasetName: orgName ? `${orgName}--${dataset.name}` : dataset.name,
      };
    } catch {
      return { dmsBaseUrl: dmsUrl, dmsDatasetName: dataset.name };
    }
  })();

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      requestAnimationFrame(() => {
        setIsTruncated(el.scrollHeight > el.clientHeight);
      });
    }
  }, [dataset.notes]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-y-3">
        {dataset.type === "visualization" && !!dataset.external_url && (
          <a
            href={dataset.external_url}
            className={`font-medium flex items-center gap-1 text-accent`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <RiExternalLinkLine className="w-5 h-5" />
            Access Visualization
          </a>
        )}
        {!!dataset.resources.length && (
          <span className="font-medium text-gray-500 inline">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-accent inline mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
              />
            </svg>
            Files: {dataset.resources.length}
          </span>
        )}

        {!!dataset.resources.length && (
          <span className="font-medium text-gray-500 inline">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5 text-accent inline mr-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Formats: {uniqueFormat(dataset.resources).join(", ")}
          </span>
        )}
        <span className="font-medium text-gray-500 inline">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 text-accent inline mr-1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
            />
          </svg>
          Created:{" "}
          {dataset.metadata_created && getTimeAgo(dataset.metadata_created)}
        </span>
        {dataset.source && dataset.source.length > 0 && (
          <div className="font-medium text-gray-500">
            <div className="flex items-start gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-accent inline-block mt-0.5 flex-shrink-0"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <span>Source{dataset.source.length > 1 ? "s" : ""}:</span>
                <div className="flex flex-col gap-1.5">
                  {dataset.source.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-darkaccent flex items-center gap-1 break-all transition"
                    >
                      <RiExternalLinkLine className="w-4 h-4 flex-shrink-0" />
                      <span className="underline">{url}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <span className="font-medium text-gray-500 inline">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5 text-accent inline mr-1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Updated:{" "}
          {dataset.metadata_modified && getTimeAgo(dataset.metadata_modified)}
        </span>
      </div>
      <div className="py-4 my-4 border-y">
        <div
          ref={textRef}
          className={`text-sm font-normal text-stone-500 transition-all ${
            !showFullDescription ? "line-clamp-4" : ""
          }`}
        >
          <MarkdownRenderer content={description} />
        </div>
        {isTruncated && (
          <button
            onClick={() => setShowFullDescription(!showFullDescription)}
            className="mt-2 border-b border-accent text-stone-500 hover:text-accent"
          >
            {showFullDescription ? (
              <span className="flex items-center">
                Read less <ChevronUpIcon className="text-accent w-4" />
              </span>
            ) : (
              <span className="flex items-center">
                Read more <ChevronDownIcon className="text-accent w-4" />
              </span>
            )}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {dataset.tags?.map((tag: Tag) => (
          <span
            className="bg-accent px-4 py-1 rounded-full text-white"
            key={tag.id}
          >
            {tag.display_name}
          </span>
        ))}
      </div>
      <span className="font-medium text-gray-500 inline">
        <div className="flex flex-wrap gap-x-2 items-center">
          <div>Export metadata as: </div>
          {metaFormats.map((item) => (
            <div key={item.format}>
              <Link
                href={`${dmsBaseUrl}/dataset/${dmsDatasetName}.${item.format}`}
                className="font-semibold group flex gap-0.5 hover:text-darkaccent"
              >
                <div className="text-accent group-hover:text-darkaccent transition flex items-center justify-center">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </div>
                <div className="uppercase">{item.label}</div>
              </Link>
            </div>
          ))}
        </div>
      </span>
    </div>
  );
}
