import React, { useState } from "react";
import {
  Search,
  Users,
  Hash,
  Terminal,
  Zap,
  Database,
  AlertCircle,
  Loader,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Shield,
  Lock,
  Globe,
  Check,
} from "lucide-react";
import Button from "../Button";
import GlitchText from "../GlitchText";
import { useNavigate } from "react-router-dom";
import LegalNotices from "../LegalNotices";
import { useUser } from "../../contexts/UserContext";
import { useTranslation } from "react-i18next";
import { runApifyExtraction, type ApifyExtractedData } from "../../lib/apify";
import {
  runAnonovaExtraction,
  type AnonovaExtractedData,
} from "../../lib/anonova";
import { supabase } from "../../lib/supabase";

type Platform = "instagram" | "linkedin" | "facebook" | "twitter";

const platforms = [
  {
    id: "instagram" as Platform,
    name: "Instagram",
    icon: Instagram,
    color: "text-pink-500",
    description: "Extract data from Instagram profiles and hashtags",
    features: [
      "Profile Details & Metrics",
      "Followers & Following Data",
      "Business & Contact Info",
      "Hashtag Analytics",
    ],
  },
  {
    id: "linkedin" as Platform,
    name: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-500",
    description: "Extract professional network data",
    features: [
      "Professional Profile Info (username, profile link)",
      "Contact Details (email, phone)",
      "Lead & Summary Insights",
    ],
  },
  {
    id: "facebook" as Platform,
    name: "Facebook",
    icon: Facebook,
    color: "text-blue-600",
    description: "Extract Facebook profiles and groups",
    features: ["Profile friends", "Group members", "Page followers"],
  },
  {
    id: "twitter" as Platform,
    name: "X/Twitter",
    icon: Twitter,
    color: "text-gray-200",
    description: "Extract Twitter followers and engagement",
    features: ["Profile followers", "Tweet engagement", "Hashtag analysis"],
  },
];

interface ExtractionConfig {
  isHashtagMode: boolean;
  profileUrl: string;
  hashtag: string;
  state?: string;
  country: string;
  language: string;
  maxResults: number;
  maxLeadsPerInput: number;
  extractFollowers: boolean;
  extractFollowing: boolean;
  platform: Platform;
}

interface ExtractionResult {
  status: "completed" | "failed";
  data: AnonovaExtractedData[] | ApifyExtractedData[];
  error?: string;
}

// External task creation function for Apify
async function createApifyTask(
  taskSource: string,
  taskType: string,
  taskEmails: string
): Promise<any> {
  const apiUrl = `/api/orders/create?source=${taskSource}&source_type=${taskType}&max_leads=${taskEmails}`;
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch data from external API");
  }

  return await response.json();
}

// External task creation function for Anonova
async function createAnonovaTask(
  taskSource: string,
  taskType: string,
  maxLeads: number
): Promise<any> {
  const apiUrl = `/api/orders/create?source=${taskSource}&source_type=${taskType}&max_leads=${maxLeads}`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: taskSource,
      type: taskType,
      max_leads: maxLeads,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch data from Anonova API");
  }

  return await response.json();
}

const ExtractionPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { credits, hasUsedFreeCredits, updateUserCredits } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [extractionConfig, setExtractionConfig] = useState<ExtractionConfig>({
    isHashtagMode: false,
    profileUrl: "",
    hashtag: "",
    state: "",
    country: "us",
    language: "en",
    maxResults: 10,
    maxLeadsPerInput: 10,
    extractFollowers: true,
    extractFollowing: false,
    platform: "instagram",
  });

  const handleStartExtraction = async () => {
    // Validate required fields
    if (!extractionConfig.hashtag) {
      setError("Please enter a hashtag");
      return;
    }

    // Common validation
    if (!extractionConfig.maxLeadsPerInput) {
      setError("Please specify the number of leads to extract");
      return;
    }

    // For Instagram, validate collection type
    if (
      extractionConfig.platform === "instagram" &&
      !extractionConfig.isHashtagMode &&
      !extractionConfig.extractFollowers &&
      !extractionConfig.extractFollowing
    ) {
      setError("Please select a collection type (HT, FL, or FO)");
      return;
    }

    if (!agreedToTerms) {
      setError("Please agree to the terms and conditions");
      return;
    }

    setIsExtracting(true);
    setError("");
    setExtractionResult(null);

    const keyword = extractionConfig.hashtag.trim();

    try {
      let results;

      if (extractionConfig.platform === "linkedin") {
        // Use runApifyExtraction for LinkedIn
        results = await runApifyExtraction({
          keyword,
          country: extractionConfig.country,
          language: extractionConfig.language,
          maxLeads: extractionConfig.maxLeadsPerInput,
        });

        setExtractionResult({
          status: "completed",
          data: results,
          error: "none",
        });
      } else if (extractionConfig.platform === "instagram") {
        // Use runAnonovaExtraction for Instagram
        const taskType = extractionConfig.isHashtagMode
          ? "HT"
          : extractionConfig.extractFollowers
          ? "FL"
          : extractionConfig.extractFollowing
          ? "FO"
          : "";

        const results = await runAnonovaExtraction({
          taskSource: keyword,
          taskType,
          maxLeads: extractionConfig.maxLeadsPerInput,
        });

        console.log(`HERE ARE THE RESULTS ${results}`);

        if (results.id) {
          setOrderId(results.id);
          console.log("This is the Order ID " + results.id);
        }

        setExtractionResult({
          status: "completed",
          data: results,
          error: "none",
        });
      }
    } catch (err: any) {
      console.error("Extraction error:", err);

      let errorMessage = "Failed to extract data. Please try again.";

      if (err.message?.includes("Minimum credits required")) {
        errorMessage = hasUsedFreeCredits
          ? "Minimum 500 credits required for extraction."
          : "Minimum 1 credit required for first extraction.";
      } else if (err.message?.includes("No results found")) {
        errorMessage =
          "No results found. Try adjusting your search terms or using a different profile/hashtag.";
      } else if (err.message?.includes("Insufficient credits")) {
        errorMessage =
          "Not enough credits available. Please purchase more credits to continue.";
      } else if (err.message?.includes("Invalid response format")) {
        errorMessage = "Received invalid data from server. Please try again.";
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setExtractionResult({
        status: "failed",
        data: [],
        error: errorMessage,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Order ID message
  const orderMessage = orderId ? (
    <div className="mt-4 p-4 bg-[#0F0]/10 border border-[#0F0]/20 rounded-lg">
      <p className="text-[#0F0] flex items-center gap-2">
        <Check className="w-5 h-5" />
        Created Order with order id {orderId}. Please check Order tab for
        progress.
      </p>
    </div>
  ) : null;

  // Early validation of credit balance
  const canStartExtraction = credits >= extractionConfig.maxResults;

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <GlitchText
          text="Start New Extraction"
          className="text-4xl font-bold mb-4"
        />
        <p className="text-gray-400">
          Configure your extraction settings and start gathering data
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Extraction Form */}
        <div className="space-y-6">
          <div className="relative bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-8">
            <div className="space-y-6">
              {/* Platform Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Select Platform
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {platforms.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() =>
                        setExtractionConfig((prev) => ({
                          ...prev,
                          platform: platform.id,
                        }))
                      }
                      className={`flex flex-col items-center gap-3 p-4 rounded-lg border transition-all ${
                        extractionConfig.platform === platform.id
                          ? "border-[#0F0] bg-[#0F0]/10"
                          : "border-gray-700 hover:border-[#0F0]/50"
                      }`}
                    >
                      <platform.icon className={`w-8 h-8 ${platform.color}`} />
                      <span className="text-sm font-medium">
                        {platform.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 p-4 border border-[#0F0]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-[#0F0]" />
                    <span className="text-sm text-[#0F0]">
                      Platform Features
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {platforms
                      .find((p) => p.id === extractionConfig.platform)
                      ?.features.map((feature, index) => (
                        <li
                          key={index}
                          className="text-sm text-gray-400 flex items-center gap-2"
                        >
                          <div className="w-1 h-1 bg-[#0F0] rounded-full" />
                          {feature}
                        </li>
                      ))}
                  </ul>
                </div>
                {/* Collection Type - Hide for LinkedIn */}
                {extractionConfig.platform !== "linkedin" && (
                  <div className="mt-6">
                    <label className="block text-sm text-gray-400 mb-2">
                      Collection Type
                    </label>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() =>
                          setExtractionConfig((prev) => ({
                            ...prev,
                            isHashtagMode: true,
                            extractFollowers: false,
                            extractFollowing: false,
                          }))
                        }
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                          extractionConfig.isHashtagMode
                            ? "border-[#0F0] bg-[#0F0]/10"
                            : "border-gray-700 hover:border-[#0F0]/50"
                        }`}
                      >
                        <Hash className="w-4 h-4" />
                        <span>HT</span>
                      </button>
                      <button
                        onClick={() =>
                          setExtractionConfig((prev) => ({
                            ...prev,
                            isHashtagMode: false,
                            extractFollowers: true,
                            extractFollowing: false,
                          }))
                        }
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                          !extractionConfig.isHashtagMode &&
                          extractionConfig.extractFollowers
                            ? "border-[#0F0] bg-[#0F0]/10"
                            : "border-gray-700 hover:border-[#0F0]/50"
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>FL</span>
                      </button>
                      <button
                        onClick={() =>
                          setExtractionConfig((prev) => ({
                            ...prev,
                            isHashtagMode: false,
                            extractFollowers: false,
                            extractFollowing: true,
                          }))
                        }
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                          !extractionConfig.isHashtagMode &&
                          extractionConfig.extractFollowing
                            ? "border-[#0F0] bg-[#0F0]/10"
                            : "border-gray-700 hover:border-[#0F0]/50"
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        <span>FO</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Target
                </label>
                <input
                  type="text"
                  value={extractionConfig.hashtag}
                  onChange={(e) =>
                    setExtractionConfig((prev) => ({
                      ...prev,
                      hashtag: e.target.value,
                    }))
                  }
                  className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                  placeholder="Enter a Hashtag"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Max Leads per Input
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={extractionConfig.maxLeadsPerInput}
                    onChange={(e) =>
                      setExtractionConfig((prev) => ({
                        ...prev,
                        maxLeadsPerInput: Math.min(
                          100,
                          Math.max(1, parseInt(e.target.value) || 10)
                        ),
                      }))
                    }
                    min="1"
                    max="100"
                    className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                    placeholder="10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    leads
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Maximum 10 leads per input for LinkedIn
                </p>
              </div>

              {/* LinkedIn-specific fields */}
              {extractionConfig.platform === "linkedin" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Country
                    </label>
                    <select
                      value={extractionConfig.country}
                      onChange={(e) =>
                        setExtractionConfig((prev) => ({
                          ...prev,
                          country: e.target.value,
                        }))
                      }
                      className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                    >
                      <option value="us">United States</option>
                      <option value="gb">United Kingdom</option>
                      <option value="ca">Canada</option>
                      <option value="au">Australia</option>
                      <option value="de">Germany</option>
                      <option value="fr">France</option>
                      <option value="es">Spain</option>
                      <option value="it">Italy</option>
                      <option value="nl">Netherlands</option>
                      <option value="se">Sweden</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Language
                    </label>
                    <select
                      value={extractionConfig.language}
                      onChange={(e) =>
                        setExtractionConfig((prev) => ({
                          ...prev,
                          language: e.target.value,
                        }))
                      }
                      className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="it">Italian</option>
                      <option value="nl">Dutch</option>
                      <option value="sv">Swedish</option>
                    </select>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleStartExtraction}
                disabled={
                  isExtracting ||
                  (!extractionConfig.hashtag && !extractionConfig.profileUrl) ||
                  !agreedToTerms
                }
              >
                {isExtracting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    EXTRACTING_DATA.exe
                  </span>
                ) : (
                  "START_EXTRACTION.exe"
                )}
              </Button>

              {/* Order ID Message */}
              {orderMessage}

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}

              {/* Legal Notices */}
              <LegalNotices
                type="extraction"
                checked={agreedToTerms}
                onChange={setAgreedToTerms}
              />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="space-y-8">
          <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-8">
            <h3 className="text-xl font-bold text-[#0F0] mb-6">
              Extraction Features
            </h3>
            <div className="space-y-6">
              {[
                {
                  icon: Zap,
                  title: "Lightning Fast Extraction",
                  description:
                    "Extract thousands of profiles in minutes with our optimized algorithms.",
                  color: "text-yellow-400",
                },
                {
                  icon: Database,
                  title: "Ghost Mode Scraping",
                  description:
                    "Undetectable extraction methods ensure your activities remain completely private.",
                  color: "text-purple-400",
                },
                {
                  icon: Globe,
                  title: "Global Proxy Network",
                  description:
                    "Automatic IP rotation across worldwide servers prevents rate limiting.",
                  color: "text-blue-400",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 border border-[#0F0]/20 rounded-lg hover:border-[#0F0]/50 transition-all group"
                >
                  <feature.icon
                    className={`w-8 h-8 ${feature.color} transform group-hover:scale-110 transition-transform`}
                  />
                  <div>
                    <h4 className="font-semibold mb-1">{feature.title}</h4>
                    <p className="text-gray-400 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-8">
            <h3 className="text-xl font-bold text-[#0F0] mb-6">
              Security Features
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-[#0F0]" />
                <span>Ghost mode extraction for undetectable operation</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#0F0]" />
                <span>Military-grade encryption (AES-256)</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-[#0F0]" />
                <span>Automatic IP rotation across global proxy network</span>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-[#0F0]" />
                <span>Smart rate limiting to prevent detection</span>
              </div>
            </div>
          </div>

          {/* Results Table */}
          {extractionResult && (
            <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-8">
              <h3 className="text-xl font-bold text-[#0F0] mb-4">
                Extraction Results
                {extractionResult.status === "completed" && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({extractionResult.data.length} records found)
                  </span>
                )}
              </h3>

              {extractionResult.status === "failed" ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
                  {extractionResult.error}
                </div>
              ) : extractionResult.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#0F0]/20">
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                          Username
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                          Profile Link
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                          Email
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                          Phone
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                          Summary
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0F0]/10">
                      {extractionResult.data.map((item, index) => (
                        <tr
                          key={index}
                          className="hover:bg-[#0F0]/5 transition-colors"
                        >
                          <td className="px-6 py-4">{item.username || "-"}</td>
                          <td className="px-6 py-4">
                            <a
                              href={item.userLink}
                              onClick={(e) => {
                                e.preventDefault();
                                window.open(
                                  item.userLink,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#0F0] hover:underline"
                            >
                              {item.username ||
                                item.userLink.split("/").pop() ||
                                "View Profile"}
                            </a>
                          </td>
                          <td className="px-6 py-4">
                            {item.emails.length > 0 ? (
                              <div className="space-y-1">
                                {item.emails.map((email, i) => (
                                  <a
                                    key={i}
                                    href={`mailto:${email}`}
                                    className="text-[#0F0] hover:underline block"
                                  >
                                    {email}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {item.phones.length > 0 ? (
                              <div className="space-y-1">
                                {item.phones.map((phone, i) => (
                                  <a
                                    key={i}
                                    href={`tel:${phone}`}
                                    className="text-[#0F0] hover:underline block"
                                  >
                                    {phone}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="truncate" title={item.summary}>
                              {item.summary || "-"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  No results found for your search criteria
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExtractionPage;
