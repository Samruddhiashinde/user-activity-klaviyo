import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser, settings }) => {
  // API endpoint - will be your app's backend
  const API_ENDPOINT = `${settings.apiUrl || 'https://your-app-url.com'}/api/track`;

  // Helper function to send events to backend
  const sendEvent = async (eventName: string, eventData: any) => {
    try {
      const payload = {
        event: eventName,
        data: eventData,
        timestamp: new Date().toISOString(),
        shopDomain: browser.location?.hostname || '',
        url: browser.location?.href || '',
        userAgent: browser.userAgent || '',
      };

      await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(`Error tracking ${eventName}:`, error);
    }
  };

  // Page Viewed Event
  analytics.subscribe('page_viewed', (event: any) => {
    sendEvent('Page Viewed', {
      pageUrl: event.context?.document?.location?.href || '',
      pageTitle: event.context?.document?.title || '',
      referrer: event.context?.document?.referrer || null,
      timestamp: event.timestamp,
    });
  });

  // Product Viewed Event
  analytics.subscribe('product_viewed', (event: any) => {
    const product = event.data?.productVariant;

    sendEvent('Product Viewed', {
      productId: product?.product?.id,
      productTitle: product?.product?.title,
      productType: product?.product?.type,
      productVendor: product?.product?.vendor,
      variantId: product?.id,
      variantTitle: product?.title,
      variantSku: product?.sku,
      price: product?.price?.amount,
      currency: product?.price?.currencyCode,
      imageUrl: product?.image?.src,
      compareAtPrice: product?.compareAtPrice?.amount,
      available: !!product?.product?.id,
    });
  });

  // Add to Cart Event
  analytics.subscribe('product_added_to_cart', (event: any) => {
    const cartLine = event.data?.cartLine;

    sendEvent('Add to Cart', {
      cartId: event.data?.cart?.id,
      productId: cartLine?.merchandise?.product?.id,
      productTitle: cartLine?.merchandise?.product?.title,
      variantId: cartLine?.merchandise?.id,
      variantTitle: cartLine?.merchandise?.title,
      quantity: cartLine?.quantity,
      price: cartLine?.merchandise?.price?.amount,
      currency: cartLine?.merchandise?.price?.currencyCode,
      linePrice: cartLine?.cost?.totalAmount?.amount,
      sku: cartLine?.merchandise?.sku,
      imageUrl: cartLine?.merchandise?.image?.src,
    });
  });

  // Remove from Cart Event
  analytics.subscribe('product_removed_from_cart', (event: any) => {
    const cartLine = event.data?.cartLine;

    sendEvent('Remove from Cart', {
      cartId: event.data?.cart?.id,
      productId: cartLine?.merchandise?.product?.id,
      productTitle: cartLine?.merchandise?.product?.title,
      variantId: cartLine?.merchandise?.id,
      quantity: cartLine?.quantity,
      price: cartLine?.merchandise?.price?.amount,
      currency: cartLine?.merchandise?.price?.currencyCode,
    });
  });

  // Checkout Started Event
  analytics.subscribe('checkout_started', (event: any) => {
    const checkout = event.data?.checkout;

    sendEvent('Checkout Started', {
      checkoutToken: checkout?.token,
      totalPrice: checkout?.totalPrice?.amount,
      subtotalPrice: checkout?.subtotalPrice?.amount,
      totalTax: checkout?.totalTax?.amount,
      currency: checkout?.currencyCode,
      lineItemsCount: checkout?.lineItems?.length,
      lineItems: checkout?.lineItems?.map((item: any) => ({
        productId: item?.variant?.product?.id,
        productTitle: item?.variant?.product?.title,
        variantId: item?.variant?.id,
        quantity: item?.quantity,
        price: item?.variant?.price?.amount,
      })),
      customer: checkout?.email ? {
        email: checkout?.email,
        phone: checkout?.phone,
      } : null,
    });
  });

  // Purchase Completed Event
  analytics.subscribe('checkout_completed', (event: any) => {
    const checkout = event.data?.checkout;
    const order = checkout?.order as any;

    sendEvent('Purchase Completed', {
      orderId: order?.id,
      orderNumber: order?.name,
      orderUrl: order?.statusUrl,
      totalPrice: checkout?.totalPrice?.amount,
      subtotalPrice: checkout?.subtotalPrice?.amount,
      totalTax: checkout?.totalTax?.amount,
      totalShipping: checkout?.shippingLine?.price?.amount,
      currency: checkout?.currencyCode,
      lineItems: checkout?.lineItems?.map((item: any) => ({
        productId: item?.variant?.product?.id,
        productTitle: item?.variant?.product?.title,
        variantId: item?.variant?.id,
        variantTitle: item?.variant?.title,
        quantity: item?.quantity,
        price: item?.variant?.price?.amount,
        sku: item?.variant?.sku,
      })),
      customer: {
        email: checkout?.email,
        phone: checkout?.phone,
        firstName: checkout?.shippingAddress?.firstName,
        lastName: checkout?.shippingAddress?.lastName,
      },
      shippingAddress: checkout?.shippingAddress,
      billingAddress: checkout?.billingAddress,
    });
  });

  // Search Performed Event
  analytics.subscribe('search_submitted', (event: any) => {
    sendEvent('Search Performed', {
      searchQuery: event.data?.searchResult?.query,
      timestamp: event.timestamp,
    });
  });

  console.log('Activity Tracker Pixel: Initialized successfully');
});
