// Edge service catalog domain (C4 6a, services/* split): listServices catalog/price-baseline
// lookup + its baseline-mapping helpers. Imported directly by services.ts.

import {
  asComplexity,
  asString,
  nullableServiceType,
  positiveNumberFrom,
} from "../_runtime/coercions.ts";
import { db, dbQuery } from "../_runtime/db.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { HCMC_DISTRICTS } from "../../../../_shared/domain.ts";

export async function listServices(ctx: MobileApiContext) {
  const client = db(ctx);
  const [catResult, probResult, baseResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_categories")
        .select("id, service_type, slug, label_vi, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_problems")
        .select(
          "id, slug, label_vi, default_complexity, service_category_id, service_type, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("price_baselines")
        .select(
          "service_type, complexity, district_code, price_min, price_max, service_problem_id",
        ),
    ),
  ]);

  if (catResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh mục dịch vụ", 500);
  }
  if (probResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách vấn đề", 500);
  }
  if (baseResult.error) {
    apiFailure("DB_ERROR", "Không thể tải bảng giá nền", 500);
  }

  const categories = catResult.data ?? [];
  const problems = probResult.data ?? [];
  const baselines = baseResult.data ?? [];

  return {
    services: categories.map((cat) => {
      const serviceType = nullableServiceType(cat.service_type);
      if (!serviceType) {
        apiFailure("DB_ERROR", "Danh mục dịch vụ có dữ liệu không hợp lệ", 500);
      }
      return {
        id: asString(cat.id),
        service_type: serviceType,
        label_vi: asString(cat.label_vi),
        problems: problems
          .filter((p) => p.service_category_id === cat.id)
          .map((p) => ({
            id: asString(p.id),
            slug: asString(p.slug),
            label_vi: asString(p.label_vi),
            default_complexity: asComplexity(p.default_complexity),
          })),
        baselines: baselines
          .filter((b) => b.service_type === cat.service_type)
          .map(toCatalogBaseline)
          .filter(uniqueCatalogBaseline),
      };
    }),
  };
}

function toCatalogBaseline(row: Record<string, unknown>) {
  const priceMin = positiveNumberFrom(row.price_min);
  const priceMax = positiveNumberFrom(row.price_max);
  if (priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure("DB_ERROR", "Bảng giá nền có dữ liệu không hợp lệ", 500);
  }
  const districtCode = asString(row.district_code);
  if (!isKnownDistrictCode(districtCode)) {
    apiFailure("DB_ERROR", "Bảng giá nền có khu vực không hợp lệ", 500);
  }
  return {
    complexity: asComplexity(row.complexity),
    district_code: districtCode,
    price_min: priceMin,
    price_max: priceMax,
  };
}

function uniqueCatalogBaseline<
  T extends {
    complexity: unknown;
    district_code: unknown;
    price_min: unknown;
    price_max: unknown;
  },
>(baseline: T, index: number, baselines: T[]) {
  const key = catalogBaselineKey(baseline);
  return baselines.findIndex((candidate) =>
    catalogBaselineKey(candidate) === key
  ) === index;
}

function catalogBaselineKey(baseline: {
  complexity: unknown;
  district_code: unknown;
  price_min: unknown;
  price_max: unknown;
}) {
  return `${baseline.complexity}:${baseline.district_code}:${baseline.price_min}:${baseline.price_max}`;
}

function isKnownDistrictCode(
  value: string,
): value is keyof typeof HCMC_DISTRICTS {
  return Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, value);
}
