"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireDb } from "@/lib/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/session";

const emailSchema=z.string().email().max(255);
export async function registerAction(formData:FormData){const nama=String(formData.get("nama")||"").trim();const email=String(formData.get("email")||"").trim().toLowerCase();const password=String(formData.get("password")||"");if(nama.length<2||nama.length>120||!emailSchema.safeParse(email).success||password.length<10||password.length>128)redirect("/register?error=invalid");const db=requireDb();const existing=await db.select({id:users.id}).from(users).where(eq(users.email,email)).limit(1);if(existing.length)redirect("/register?error=exists");const passwordHash=await bcrypt.hash(password,12);const [user]=await db.insert(users).values({nama,email,passwordHash}).returning({id:users.id,nama:users.nama,email:users.email});await createSession(user);redirect("/dashboard");}
export async function loginAction(formData:FormData){const email=String(formData.get("email")||"").trim().toLowerCase();const password=String(formData.get("password")||"");if(!emailSchema.safeParse(email).success||!password)redirect("/login?error=invalid");const db=requireDb();const [user]=await db.select().from(users).where(eq(users.email,email)).limit(1);if(!user||!(await bcrypt.compare(password,user.passwordHash)))redirect("/login?error=credentials");await createSession({id:user.id,nama:user.nama,email:user.email});redirect("/dashboard");}
export async function logoutAction(){await destroySession();redirect("/");}
