import formurlencoded from 'form-urlencoded';

import { ensureConfig, getConfig } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';
import { logError } from '@edx/frontend-platform/logging';

import { handleApiError } from '../../data/handleRequestError';

ensureConfig(['ECOMMERCE_BASE_URL', 'STRIPE_RESPONSE_URL'], 'Stripe API service');

/**
 * Checkout with Stripe
 *
 * 1. Update Payment Intent with billing form data on submit
 * 2. POST request to ecommerce Stripe API
 * 3. Redirect to receipt page
 */
export default async function checkout(
  basket,
  {
    cardHolderInfo, stripe, elements, context, products,
  },
  setLocation = href => { global.location.href = href; }, // HACK: allow tests to mock setting location
) {
  async function stripePaymentMethodHandler(result) {
    const { basketId } = basket;
    if (result.error) {
      // Show updatePaymentIntent error by the Stripe billing form fields
      if (result.error.type === 'card_error' || result.error.type === 'validation_error') {
        // setMessage(result.error.message);
        console.log(result.error.message);
      } else {
        // setMessage('An unexpected error occurred.');
        console.log('Uh oh');
      }
      // setIsLoading(false);
    } else {
      // Otherwise send paymentIntent.id to your server
      const skus = products.map(({ sku }) => sku).join(','); // generate comma separated list of product SKUs
      const postData = formurlencoded({
        payment_intent_id: result.paymentIntent.id,
        skus,
      });
      await getAuthenticatedHttpClient()
        .post(
          `${process.env.STRIPE_RESPONSE_URL}`,
          postData,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        )
        .then(response => {
          setLocation(response.data.receipt_page_url);
        })
        .catch(error => {
          const errorData = error.response ? error.response.data : null;
          if (errorData && error.response.data.sdn_check_failure) {
            /* istanbul ignore next */
            if (getConfig().ENVIRONMENT !== 'test') {
              // SDN failure: redirect to Ecommerce SDN error page.
              setLocation(`${getConfig().ECOMMERCE_BASE_URL}/payment/sdn/failure/`);
            }
            logError(error, {
              messagePrefix: 'SDN Check Error',
              paymentMethod: 'Cybersource',
              paymentErrorType: 'SDN Check Submit Api',
              basketId,
            });
            throw new Error('This card holder did not pass the SDN check.');
          } else if (errorData && errorData.sku_error) {
            // skuErrorDispatcher();
            // TODO handle SKU error
            console.log('SKU error');
            handleApiError(error);
          } else if (errorData && errorData.user_message) {
            // Stripe error: tell user.
            handleApiError(error);
          } else {
            // Unknown error: log and tell user.
            logError(error, {
              messagePrefix: 'Stripe Submit Error',
              paymentMethod: 'Stripe',
              paymentErrorType: 'Submit Error',
            });
            handleApiError(error);
          }
        //   setIsLoading(false);
        });
    }
  }

  const result = await stripe.updatePaymentIntent({
    elements,
    params: {
      payment_method_data: {
        billing_details: {
          address: {
            city: cardHolderInfo.city,
            country: cardHolderInfo.country,
            line1: cardHolderInfo.address,
            line2: cardHolderInfo.unit || '',
            postal_code: cardHolderInfo.postalCode || '',
            state: cardHolderInfo.state || '',
          },
          email: context.authenticatedUser.email,
          name: `${cardHolderInfo.firstName} ${cardHolderInfo.lastName}`,
        },
        metadata: {
          organization: cardHolderInfo.organization, // JK TODO: check how ecommerce is receiving this
          purchased_for_organization: cardHolderInfo.purchasedForOrganization,
        },
      },
    },
  });
  stripePaymentMethodHandler(result);

//   if (basket.discountJwt) {
//     formData.discount_jwt = basket.discountJwt;
//   }
}
