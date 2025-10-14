import { setSystemTime, expect, test } from "bun:test";
import {cast} from "../src/transformer";

test("slot_to_date", () => {
    process.env.TZ = "Africa/Casablanca";
    setSystemTime(new Date("2020-01-01T00:00:00.000Z"));

    expect(cast('17_19','slot_to_date')).toBe('2020-01-01T16:00:00.000000Z');
});
