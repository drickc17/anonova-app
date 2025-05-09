import React, { useState, useEffect, act } from "react";
import {
  Search,
  Download,
  Filter,
  AlertCircle,
  Play,
  Clock,
  Hash,
  Users,
  Terminal,
  Loader,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Button from "../Button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import LegalNotices from "../LegalNotices";
import { supabase } from "../../lib/supabase";
import { runAnonovaExtraction } from "../../lib/anonova";
import { runLinkedInExtraction } from "../../lib/linkedInApify";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  selectData,
  selectAction,
} from "../../features/instagramData/instagramDataSlice";
import { setAction } from "../../features/instagramData/instagramDataSlice";
import { response } from "express";
import DatePicker from "react-datepicker"; // Use default import for DatePicker
import "react-datepicker/dist/react-datepicker.css"; // Import DatePicker CSS

const MatrixLoader = () => (
  <div className="matrix-loader">
    <div className="flex items-center">
      <div className="spinner mr-2"></div>
      <div className="wave-text">
        {'Loading...'.split('').map((letter, index) => (
          <span
            key={index}
            className="wave-letter"
            style={{
              animationDelay: `${index * 0.15}s`,
              display: 'inline-block'
            }}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export interface Order {
  id: string;
  source_type: string;
  results_id: number;
  platform: "instagram" | "linkedin" | "facebook" | "twitter";
  status: string;
  status_display: string;
  source: string;
  max_leads: number;
  scraped_leads: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  csv_url: string | null;
  error: string | null;
}

const OrdersHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<
    "all" | "instagram" | "linkedin" | "facebook" | "twitter"
  >("all");
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const uniqueStatuses = Array.from(new Set(orders.map(order => order.status_display)));

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const filteredOrders = orders.filter((order) => {
    // Filter by platform if selected
    if (selectedPlatform !== "all" && order.platform !== selectedPlatform) {
      return false;
    }

    const orderDate = new Date(order.created_at);
    const matchesDateRange =
      (!startDate || orderDate >= startDate) &&
      (!endDate || orderDate <= endDate);

    const matchesStatus =
      statusFilter.length === 0 || statusFilter.includes(order.status_display);

    return matchesDateRange && matchesStatus;
  });

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  // Fetch orders when component mounts
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true); 

      try {
        if (!user) return;

        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;

        setOrders(data || []);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setError("Failed to load orders. Please try again.");
      } finally {
        setLoading(false); 
      }
    };

    fetchOrders();
  }, [user]);

  useEffect(() => {
    const checkOrderStatus = async () => {
      orders.forEach(async (order) => {
        if (order.platform === "instagram") {
          try {
            const response = await runAnonovaExtraction({
              action: "orderDetail",
              orderId: order.results_id,
              platform: order.platform,
            });

            if (response.status_display) {
              const { error } = await supabase
                .from("orders")
                .update({
                  status_display: response.status_display,
                })
                .eq("results_id", order.results_id);

              if (error) {
                console.error("Error updating order status:", error);
              }
            }
          } catch (err) {
            console.error("Error running Anonova extraction:", err);
          }
        } else if (order.platform === "linkedin") {
          try {
            const response = await runLinkedInExtraction({
              action: "orderDetail",
              orderId: order.results_id,
            });

            if (response.status) {
              const { error } = await supabase
                .from("orders")
                .update({
                  status_display: response.status,
                })
                .eq("results_id", order.results_id);

              if (error) {
                console.error("Error updating order status:", error);
              }

              if (response.status === "SUCCEEDED") {
                const downloadUrlResponse = await runLinkedInExtraction({
                  action: "download",
                  orderId: response.defaultDatasetId,
                });

                if (downloadUrlResponse) {
                  const { error } = await supabase
                    .from("orders")
                    .update({
                      csv_url: downloadUrlResponse,
                    })
                    .eq("results_id", order.results_id);
                  if (error) {
                    console.error("Error updating order status:", error);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error running Anonova extraction:", err);
          }
        }
      });

      const pendingOrders = orders.filter(
        (order) =>
          order.status_display !== "completed" &&
          order.status_display !== "failed"
      );

      if (pendingOrders.length > 0) {
        const { data: updatedOrders, error } = await supabase
          .from("orders")
          .select("*")
          .in(
            "id",
            pendingOrders.map((order) => order.id)
          );

        if (!error && updatedOrders) {
          setOrders((prev) => {
            const newOrders = [...prev];
            updatedOrders.forEach((updatedOrder) => {
              const index = newOrders.findIndex(
                (o) => o.id === updatedOrder.id
              );
              if (index !== -1) {
                newOrders[index] = updatedOrder;
              }
            });
            return newOrders;
          });
        }
      }
    };

    // Check status every minute
    const interval = setInterval(checkOrderStatus, 20000);
    return () => clearInterval(interval);
  }, [orders]);

  useEffect(() => {
    const updateOrders = () => {
      orders.forEach(async (order) => {
        try {
          if (order.status_display === "Completed") {
            const actionData = await runAnonovaExtraction({
              action: "download",
              orderId: order.results_id,
            });

            if (actionData) {
              const { error } = await supabase
                .from("orders")
                .update({
                  csv_url: actionData,
                })
                .eq("results_id", order.results_id);
              if (error) {
                console.error("Error updating order status:", error);
              }
            }
          }
        } catch (err) {
          console.error("Error running Anonova extraction:", err);
        }
      });
    };

    // Check status every minute
    const interval = setInterval(updateOrders, 60000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleContinueScraping = (order: Order) => {
    navigate("/dashboard/extraction", {
      state: {
        continueExtraction: true,
        orderId: order.id,
        source: order.source,
        sourceType: order.source_type,
      },
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const downloadCsvFile = async (downloadLink: string) => {
    const link = JSON.parse(downloadLink);
    try {
      const response = await fetch(link.downloadUrl, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to download CSV file");
      }

      window.open(link.downloadUrl, "_blank");
    } catch (error) {
      console.error("Error downloading CSV file:", error);
    }
  };

  const toggleDateFilter = () => {
    setIsDateFilterOpen(!isDateFilterOpen);
  };

  return (
    <div>
      {loading ? (
        <MatrixLoader />
      ) : (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold text-[#0F0]">Orders & History</h2>
              <p className="text-gray-400 mt-2">
                View and manage your extraction orders across all platforms
              </p>
            </div>
          </div>

          {/* Platform Selection */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Platform Filter with Date Filter inside */}
            <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#0F0] mb-4">
                Select Platform
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                <button
                  onClick={() => setSelectedPlatform("all")}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${selectedPlatform === "all"
                    ? "border-[#0F0] bg-[#0F0]/10"
                    : "border-gray-700 hover:border-[#0F0]/50"
                    } min-w-[120px] justify-center px-4`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>All</span>
                </button>
                <button
                  onClick={() => setSelectedPlatform('instagram')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${selectedPlatform === 'instagram'
                    ? 'border-[#0F0] bg-[#0F0]/10'
                    : 'border-gray-700 hover:border-[#0F0]/50'
                    } min-w-[120px] justify-center px-4`}
                >
                  <Instagram className="w-4 h-4 text-pink-500" />
                  <span className="capitalize">Instagram</span>
                </button>
                <button
                  onClick={() => setSelectedPlatform("linkedin")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${selectedPlatform === "linkedin"
                    ? "border-[#0F0] bg-[#0F0]/10"
                    : "opacity-50 cursor-not-allowed border-gray-800"
                    } min-w-[120px] justify-center px-4`}
                  disabled={true}
                >
                  <Linkedin className="w-4 h-4 text-blue-500" />
                  <span className="capitalize">LinkedIn</span>
                  <span className="block text-xs text-red-500 mt-1">Coming Soon</span>
                </button>
                <button
                  onClick={() => setSelectedPlatform("facebook")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${selectedPlatform === "facebook"
                    ? "border-[#0F0] bg-[#0F0]/10"
                    : "opacity-50 cursor-not-allowed border-gray-800"
                    } min-w-[120px] justify-center px-4`}
                  disabled={true}
                >
                  <Facebook className="w-4 h-4 text-blue-600" />
                  <span className="capitalize">Facebook</span>
                  <span className="block text-xs text-red-500 mt-1">Coming Soon</span>
                </button>
                <button
                  onClick={() => setSelectedPlatform("twitter")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${selectedPlatform === "twitter"
                    ? "border-[#0F0] bg-[#0F0]/10"
                    : "opacity-50 cursor-not-allowed border-gray-800"
                    } min-w-[120px] justify-center px-4`}
                  disabled={true}
                >
                  <Twitter className="w-4 h-4 text-gray-200" />
                  <span className="capitalize">Twitter</span>
                  <span className="block text-xs text-red-500 mt-1">Coming Soon</span>
                </button>
              </div>
              {/* Date Range Filter inside Platform Filter */}
              <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-6 relative z-50 mt-6">
                <h3
                  className="text-lg font-bold text-[#0F0] mb-4 cursor-pointer flex items-center"
                  onClick={toggleDateFilter}
                >
                  Filter by Date
                  {isDateFilterOpen ? (
                    <ChevronUp className="w-4 h-4 ml-2" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-2" />
                  )}
                </h3>
                {isDateFilterOpen && (
                  <div className="relative z-[100]">
                    <div className="flex gap-4">
                      <DatePicker
                        selected={startDate}
                        onChange={(date) => setStartDate(date)}
                        placeholderText="Start Date"
                        className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                        popperClassName="z-[1000]"
                      />
                      <DatePicker
                        selected={endDate}
                        onChange={(date) => setEndDate(date)}
                        placeholderText="End Date"
                        className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                        popperClassName="z-[1000]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Search Orders with Status Filter inside */}
            <div className="flex-1 bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#0F0] mb-4">Search Orders</h3>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by target or type..."
                  className="w-full bg-black/50 border border-[#0F0]/30 rounded-lg py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:border-[#0F0] focus:ring-1 focus:ring-[#0F0] transition-all"
                />
              </div>
              {/* Status Filter inside Search Orders */}
              <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl p-6 mt-6">
                <h3 className="text-lg font-bold text-[#0F0] mb-4">Filter by Status</h3>
                <div className="flex flex-wrap gap-4">
                  {uniqueStatuses.map(status => (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={statusFilter.includes(status)}
                        onChange={() => handleStatusChange(status)}
                        className="form-checkbox text-[#0F0]"
                      />
                      <span className="ml-2 text-white">{status}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-black/40 backdrop-blur-sm border border-[#0F0]/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#0F0]/20">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Platform
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Source Type
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Order ID
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Source
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Max Leads
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Scraped
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Updated
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#0F0]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F0]/10">
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-[#0F0]/5 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {order.platform === "instagram" && (
                              <Instagram className="w-4 h-4 text-pink-500" />
                            )}
                            {order.platform === "linkedin" && (
                              <Linkedin className="w-4 h-4 text-blue-500" />
                            )}
                            {order.platform === "facebook" && (
                              <Facebook className="w-4 h-4 text-blue-600" />
                            )}
                            {order.platform === "twitter" && (
                              <Twitter className="w-4 h-4 text-gray-200" />
                            )}
                            <span className="capitalize">{order.platform}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          <div className="flex items-center gap-2">
                            {order.source_type === "HT" ? (
                              <Hash className="w-4 h-4" />
                            ) : (
                              <Users className="w-4 h-4" />
                            )}
                            {order.source_type}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${order.status_display === "completed"
                              ? "bg-[#0F0]/10 text-[#0F0]"
                              : order.status_display === "failed"
                                ? "bg-red-400/10 text-red-400"
                                : "bg-yellow-400/10 text-yellow-400"
                              }`}
                          >
                            {order.status_display}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-[#0F0]">
                          {order.results_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {order.source}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {order.max_leads}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {order.scraped_leads}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {formatDate(order.updated_at)}
                        </td>
                        <td className="px-6 py-4">
                          {(order.status_display === "Completed" ||
                            order.status_display === "SUCCEEDED") &&
                            order.csv_url && (
                              <Button
                                variant="secondary"
                                className="w-full text-xs bg-[#0F0]/5 hover:bg-[#0F0]/10 border-[#0F0]/30 hover:border-[#0F0]/50 text-[#0F0] transition-all duration-300 flex items-center justify-center gap-1.5"
                                onClick={() => downloadCsvFile(order.csv_url!)}
                              >
                                <Download className="w-3 h-3" />
                                Download CSV
                              </Button>
                            )}
                          {order.status === "failed" && (
                            <>
                              <div className="w-full px-3 py-1.5 text-xs text-red-400 bg-red-400/5 border border-red-400/30 rounded-lg flex items-center justify-center gap-1.5">
                                <AlertCircle className="w-3 h-3" />
                                {order.error || "Extraction failed"}
                              </div>
                              <Button
                                variant="secondary"
                                className="w-full text-xs bg-black/50 hover:bg-black/70 border-[#0F0]/30 hover:border-[#0F0]/50 text-[#0F0] transition-all duration-300 flex items-center justify-center gap-1.5"
                                onClick={() => handleContinueScraping(order)}
                              >
                                <Play className="w-3 h-3" />
                                Continue Scraping
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center">
                        <Terminal className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">
                          No extractions found. Start your first extraction!
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() => navigate("/dashboard/extraction")}
                        >
                          Start Extraction
                        </Button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-center mt-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 mx-1 bg-[#0F0]/10 text-[#0F0] rounded disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index + 1}
                onClick={() => handlePageChange(index + 1)}
                className={`px-4 py-2 mx-1 bg-[#0F0]/10 text-[#0F0] rounded ${currentPage === index + 1 ? "bg-[#0F0]/20" : ""
                  }`}
              >
                {index + 1}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 mx-1 bg-[#0F0]/10 text-[#0F0] rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersHistory;