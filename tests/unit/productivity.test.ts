import { expect, it } from "vitest";
import {
  csvCell,
  serializeCsv,
  recoveryMessage,
} from "../../src/lib/productivity";
it("escapes CSV formulas, quotes, multiline text and exact decimal amounts", () => {
  for (const text of ["=1+1", " +SUM(A1)", "\t@cmd", "\r-2", "\uFEFF=cmd"])
    expect(csvCell(text)).toBe("\"'" + text + '"');
  expect(csvCell('Oak "A",\nplan')).toBe('"Oak ""A"",\nplan"');
  expect(serializeCsv(["Amount (PHP)"], [["100.10"]])).toBe(
    '\uFEFF"Amount (PHP)"\r\n"100.10"\r\n',
  );
});
it("gives safe recovery guidance without repeating raw diagnostic details", () => {
  expect(recoveryMessage("VERSION_CONFLICT secret diagnostic")).toContain(
    "Reload",
  );
  expect(recoveryMessage("ACCESS_DENIED private record")).not.toContain(
    "private record",
  );
  expect(recoveryMessage("JWT expired")).toContain("Sign in again");
  expect(recoveryMessage("unknown stack trace")).not.toContain("stack trace");
});
