import type { ServiceType } from "../../../_shared/domain.ts";
import {
  HCMC_DISTRICTS,
  normalizeDistrict,
} from "../../../_shared/domain.ts";

export function kaelServiceLabelVi(service: string): string {
  if (service === "electrical") return "sửa điện";
  if (service === "plumbing") return "sửa nước";
  if (service === "cleaning") return "vệ sinh nhà";
  if (service === "hvac") return "điều hòa và không khí";
  if (service === "upholstery") return "vệ sinh sofa, nệm, rèm hoặc thảm";
  if (service === "handyman") return "sửa vặt và lắp đặt nhỏ";
  return "dịch vụ nhà ở";
}

export function serviceLabel(serviceType: ServiceType): string {
  if (serviceType === "electrical") return "Sửa điện";
  if (serviceType === "plumbing") return "Sửa nước";
  if (serviceType === "cleaning") return "Vệ sinh nhà";
  if (serviceType === "hvac") return "Điều hòa & Không khí";
  if (serviceType === "upholstery") return "Sofa, nệm, rèm, thảm";
  if (serviceType === "handyman") return "Sửa vặt & Lắp đặt nhỏ";
  return "Dịch vụ nhà ở";
}

export function districtLabel(district: string): string {
  const slug = normalizeDistrict(district);
  return HCMC_DISTRICTS[slug] ?? HCMC_DISTRICTS.hcmc_all;
}
