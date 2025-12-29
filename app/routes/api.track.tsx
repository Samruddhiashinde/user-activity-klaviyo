import type { ActionFunctionArgs } from "react-router";
import { prisma } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await request.json();
    const { event, data, timestamp, shopDomain } = payload;

    // Try to find shop by exact domain or by cleaning the domain
    let shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    // If not found, try without .myshopify.com
    if (!shop && shopDomain?.includes('.myshopify.com')) {
      const cleanDomain = shopDomain.replace('.myshopify.com', '');
      shop = await prisma.shop.findUnique({
        where: { shopDomain: cleanDomain },
      });
    }

    if (!shop) {
      console.log(`Shop not found: ${shopDomain}`);
      return new Response(JSON.stringify({ error: "Shop not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if event tracking is enabled for this event type
    const eventSettings = shop.eventSettings as any;
    const eventKey = event.replace(/\s+/g, '');

    if (eventSettings && !eventSettings[eventKey]?.enabled) {
      return new Response(JSON.stringify({ message: "Event tracking disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check consent flags (GDPR compliance)
    const consentFlags = shop.consentFlags as any;
    if (consentFlags && !consentFlags.marketing) {
      return new Response(JSON.stringify({ message: "No marketing consent" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Enrich event data with shop context
    const enrichedData = {
      ...data,
      storeDomain: shop.shopDomain,
      eventTimestamp: timestamp,
      receivedAt: new Date().toISOString(),
    };

    // Send to Klaviyo if configured
    if (shop.klaviyoApiKey) {
      try {
        await sendToKlaviyo(event, enrichedData, shop);
      } catch (klaviyoError: any) {
        console.error("Klaviyo error:", klaviyoError);

        // Log failed event for retry
        await prisma.failedEvent.create({
          data: {
            shopId: shop.id,
            eventType: event,
            payload: payload,
            error: klaviyoError.message,
            retryCount: 0,
          },
        });
      }
    }

    // Log successful processing
    await prisma.debugLog.create({
      data: {
        shopId: shop.id,
        level: "info",
        message: `Event processed: ${event}`,
        metadata: { event, timestamp },
      },
    });

    return new Response(JSON.stringify({ success: true, message: "Event tracked successfully" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error processing event:", error);

    return new Response(
      JSON.stringify({ error: "Failed to process event", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

// Function to send events to Klaviyo
async function sendToKlaviyo(
  eventName: string,
  data: any,
  shop: any
): Promise<void> {
  if (!shop.klaviyoApiKey) {
    throw new Error("Klaviyo API key not configured");
  }

  const klaviyoEventName = mapEventNameForKlaviyo(eventName);

  const klaviyoPayload = {
    data: {
      type: "event",
      attributes: {
        metric: {
          name: klaviyoEventName,
        },
        profile: buildKlaviyoProfile(data),
        properties: data,
        time: data.eventTimestamp || new Date().toISOString(),
      },
    },
  };

  const response = await fetch("https://a.klaviyo.com/api/events/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Klaviyo-API-Key ${shop.klaviyoApiKey}`,
      revision: "2024-10-15",
    },
    body: JSON.stringify(klaviyoPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Klaviyo API error: ${response.status} - ${errorText}`);
  }
}

function mapEventNameForKlaviyo(eventName: string): string {
  const mapping: Record<string, string> = {
    "Page Viewed": "Viewed Page",
    "Product Viewed": "Viewed Product",
    "Add to Cart": "Added to Cart",
    "Remove from Cart": "Removed from Cart",
    "Checkout Started": "Started Checkout",
    "Purchase Completed": "Placed Order",
    "Search Performed": "Searched Site",
  };

  return mapping[eventName] || eventName;
}

function buildKlaviyoProfile(data: any): any {
  const profile: any = {};

  if (data.customer?.email) {
    profile.email = data.customer.email;
  }

  if (data.customer?.phone) {
    profile.phone_number = data.customer.phone;
  }

  if (data.customer?.firstName) {
    profile.first_name = data.customer.firstName;
  }

  if (data.customer?.lastName) {
    profile.last_name = data.customer.lastName;
  }

  if (Object.keys(profile).length === 0) {
    profile.$anonymous = data.shopDomain || "anonymous";
  }

  return profile;
}
