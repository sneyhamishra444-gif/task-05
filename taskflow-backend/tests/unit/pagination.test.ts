import { parsePagination, buildPaginatedResponse } from "../../src/utils/pagination";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20 when nothing is provided", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("computes offset correctly for page > 1", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
  });

  it("accepts numeric (not just string) query values", () => {
    expect(parsePagination({ page: 2, limit: 5 })).toEqual({
      page: 2,
      limit: 5,
      offset: 5,
    });
  });

  it("falls back to defaults for invalid page", () => {
    expect(parsePagination({ page: "not-a-number" })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("falls back to defaults for page 0 or negative", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
  });

  it("floors fractional page/limit values", () => {
    expect(parsePagination({ page: "2.9", limit: "10.9" })).toEqual({
      page: 2,
      limit: 10,
      offset: 10,
    });
  });

  it("caps limit at the maximum (100)", () => {
    expect(parsePagination({ limit: "10000" }).limit).toBe(100);
  });

  it("falls back to default limit for invalid/zero/negative limit", () => {
    expect(parsePagination({ limit: "0" }).limit).toBe(20);
    expect(parsePagination({ limit: "-3" }).limit).toBe(20);
    expect(parsePagination({ limit: "abc" }).limit).toBe(20);
  });
});

describe("buildPaginatedResponse", () => {
  it("shapes the response exactly as required by the assignment", () => {
    const result = buildPaginatedResponse([{ id: 1 }, { id: 2 }], 37, {
      page: 2,
      limit: 2,
      offset: 2,
    });
    expect(result).toEqual({
      data: [{ id: 1 }, { id: 2 }],
      total: 37,
      page: 2,
      limit: 2,
    });
  });

  it("handles an empty page", () => {
    const result = buildPaginatedResponse([], 0, { page: 1, limit: 20, offset: 0 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });
});
