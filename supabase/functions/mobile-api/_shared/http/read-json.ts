import {
  readJsonRequestBounded,
  RequestJsonError,
} from "../../../_shared/request-json.ts";
import { apiFailure } from "../platform/api-failure.ts";

const MAX_JSON_BODY_BYTES = 64 * 1024;

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await readJsonRequestBounded(request, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestJsonError) {
      if (error.code === "PAYLOAD_TOO_LARGE") {
        apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
      }
      if (error.code === "UNSUPPORTED_MEDIA_TYPE") {
        apiFailure(
          "UNSUPPORTED_MEDIA_TYPE",
          "Yêu cầu phải dùng dữ liệu JSON",
          415,
        );
      }
    }
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
}
