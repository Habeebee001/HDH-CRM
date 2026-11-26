import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("later sign-ups are account requests, locked until approved", async ({
  createUser,
}) => {
  await createUser({ email: "john@doe.com", password: "password" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54341",
    process.env.VITE_SB_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  // The request is recorded but gives no session...
  const { data, error } = await supabase.auth.signUp({
    email: "jane@doe.com",
    password: "password",
  });
  expect(error).toBeNull();
  expect(data.session).toBeNull();

  // ...and signing in is refused until an administrator approves it
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: "jane@doe.com",
    password: "password",
  });
  expect(signInError?.code).toBe("pending_approval");
});

test("a teammate requests an account and an administrator approves it", async ({
  page,
  isMobile,
  createSales,
}) => {
  test.skip(isMobile, "User management is only available on desktop");

  await createSales({
    administrator: true,
    email: "john@doe.com",
    first_name: "John",
    last_name: "Doe",
    password: "password",
  });

  // The teammate asks for an account from the sign-in page
  await page.goto("/");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Smith");
  await page.getByLabel("Email").fill("jane@smith.com");
  await page.getByLabel("Password").fill("password-123");
  await page.getByRole("button", { name: "Request my account" }).click();
  await expect(page.getByText("Thank you!")).toBeVisible();

  // Signing in is refused while the request waits
  await page.getByText("Back to sign in").click();
  await page.getByLabel("Email").fill("jane@smith.com");
  await page.getByLabel("Password").fill("password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/waiting for an administrator/)).toBeVisible();

  // The administrator approves it as a sales rep
  await page.getByLabel("Email").fill("john@doe.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await page.goto("/#/sales");
  await expect(page.getByText("Account requests (1)")).toBeVisible();
  await page.getByRole("button", { name: "Approve…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Jane Smith is approved/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "jane@smith.com" })).toBeVisible();
});

test("an administrator can still create users", async ({
  page,
  isMobile,
  createSales,
}) => {
  test.skip(isMobile, "User management is only available on desktop");

  await createSales({
    administrator: true,
    email: "john@doe.com",
    first_name: "John",
    last_name: "Doe",
    password: "password",
  });

  await page.goto("/");
  await page.getByLabel("Email").fill("john@doe.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await page.goto("/#/sales");
  await page.getByRole("link", { name: "New user" }).click();
  await page.getByLabel("First name").fill("Marie");
  await page.getByLabel("Last name").fill("Curie");
  await page.getByLabel("Email").fill("marie@curie.com");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(/^User created/)).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "marie@curie.com" }),
  ).toBeVisible();
});
