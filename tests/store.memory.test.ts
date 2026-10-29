import { createMemoryStore } from "@/lib/store/memory";
import { runStoreContract } from "./store-contract";

runStoreContract("memory", async () => createMemoryStore());
