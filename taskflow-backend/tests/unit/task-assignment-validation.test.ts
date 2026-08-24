import {
  assignTaskSchema,
  bulkStatusUpdateSchema,
  taskFiltersSchema,
} from "../../src/modules/tasks/tasks.validation";

describe("assignTaskSchema", () => {
  it("accepts a valid UUID userId", () => {
    const result = assignTaskSchema.safeParse({
      userId: "11bd75fd-21f2-4e01-a7e4-53a5b9ba2c83",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing userId", () => {
    const result = assignTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID userId", () => {
    const result = assignTaskSchema.safeParse({ userId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects extra garbage instead of a string", () => {
    const result = assignTaskSchema.safeParse({ userId: 12345 });
    expect(result.success).toBe(false);
  });
});

describe("bulkStatusUpdateSchema", () => {
  it("accepts a valid list of task ids and a valid status", () => {
    const result = bulkStatusUpdateSchema.safeParse({
      taskIds: ["11bd75fd-21f2-4e01-a7e4-53a5b9ba2c83"],
      status: "done",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty taskIds array", () => {
    const result = bulkStatusUpdateSchema.safeParse({ taskIds: [], status: "done" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const result = bulkStatusUpdateSchema.safeParse({
      taskIds: ["11bd75fd-21f2-4e01-a7e4-53a5b9ba2c83"],
      status: "not-a-real-status",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 task ids", () => {
    const tooMany = Array.from(
      { length: 201 },
      () => "11bd75fd-21f2-4e01-a7e4-53a5b9ba2c83"
    );
    const result = bulkStatusUpdateSchema.safeParse({ taskIds: tooMany, status: "done" });
    expect(result.success).toBe(false);
  });
});

describe("taskFiltersSchema", () => {
  it("accepts a fully-specified filter set", () => {
    const result = taskFiltersSchema.safeParse({
      status: "in_progress",
      priority: "urgent",
      assignee: "11bd75fd-21f2-4e01-a7e4-53a5b9ba2c83",
      dueDateFrom: "2026-01-01T00:00:00.000Z",
      dueDateTo: "2026-12-31T00:00:00.000Z",
      page: "2",
      limit: "10",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty filter set (all optional)", () => {
    expect(taskFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an invalid status enum value", () => {
    expect(taskFiltersSchema.safeParse({ status: "bogus" }).success).toBe(false);
  });

  it("rejects a non-UUID assignee", () => {
    expect(taskFiltersSchema.safeParse({ assignee: "nope" }).success).toBe(false);
  });

  it("rejects an invalid date string for dueDateFrom", () => {
    expect(taskFiltersSchema.safeParse({ dueDateFrom: "not-a-date" }).success).toBe(false);
  });
});
