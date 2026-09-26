"use client";

import React, { useState, useEffect } from "react";
import { UtensilsCrossed } from "lucide-react";
import { CanteenMenuItem, getCanteenMenuItemsAction } from "@/lib/canteen/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function CanteenManagementPage() {
  const [menuItems, setMenuItems] = useState<CanteenMenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getCanteenMenuItemsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setMenuItems(res.data);
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex justify-between items-center">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Hospital Cafeteria & Nutrition POS
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Canteen & Dietary POS Terminal
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage cafeteria menu items, staff meal subsidies, and point-of-sale food receipts.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Available Menu Items ({menuItems.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading cafeteria menu...</div>
        ) : menuItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No menu items registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {menuItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{item.item_name}</td>
                    <td className="px-4 py-3">{item.item_category}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{formatCurrencyBDT(item.price)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        Available
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
