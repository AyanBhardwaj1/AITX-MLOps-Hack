import { createMemoryWaitlist } from "@/lib/waitlist/memory";
import { runWaitlistContract } from "./waitlist-contract";

runWaitlistContract("memory", async () => createMemoryWaitlist());
