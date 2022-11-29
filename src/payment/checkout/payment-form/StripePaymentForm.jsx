import React, {
  useContext, useEffect, useRef, useState,
} from 'react';
import { connect } from 'react-redux';
import { reduxForm, SubmissionError } from 'redux-form';
import PropTypes from 'prop-types';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

import { injectIntl, FormattedMessage } from '@edx/frontend-platform/i18n';
import { AppContext } from '@edx/frontend-platform/react';
import { sendTrackEvent } from '@edx/frontend-platform/analytics';

import CardHolderInformation from './CardHolderInformation';
import PlaceOrderButton from './PlaceOrderButton';
import {
  getRequiredFields, validateRequiredFields, validateAsciiNames,
} from './utils/form-validators';

import { getPerformanceProperties, markPerformanceIfAble } from '../../performanceEventing';

function StripePaymentForm({
  disabled,
  enableStripePaymentProcessor,
  handleSubmit,
  isBulkOrder,
  loading,
  isQuantityUpdating,
  isProcessing,
  onSubmitButtonClick,
  onSubmitPayment,
  options,
  submitErrors,
  products,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const context = useContext(AppContext);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [firstErrorId, setfirstErrorId] = useState(false);
  const [shouldFocusFirstError, setshouldFocusFirstError] = useState(false);
  const inputElement = useRef(null);

  // TODO: rename to distinguish loading of data and loading of card details
  const showLoadingButton = loading || isQuantityUpdating || isLoading || !stripe || !elements;

  useEffect(() => {
    // Focus on first input with an errror in the form
    if (
      shouldFocusFirstError
      && Object.keys(submitErrors).length > 0
    ) {
      const form = inputElement.current;
      const elementSelectors = Object.keys(submitErrors).map((fieldName) => `[id=${fieldName}]`);
      const firstElementWithError = form.querySelector(elementSelectors.join(', '));
      if (firstElementWithError) {
        if (['input', 'select'].includes(firstElementWithError.tagName.toLowerCase())) {
          firstElementWithError.focus();
          setshouldFocusFirstError(false);
          setfirstErrorId(null);
        } else if (firstErrorId !== firstElementWithError.id) {
          setfirstErrorId(firstElementWithError.id);
        }
      }
    }
  }, [firstErrorId, shouldFocusFirstError, submitErrors]);

  const onSubmit = async (values) => {
    // istanbul ignore if
    if (disabled) { return; }

    setshouldFocusFirstError(true);
    const requiredFields = getRequiredFields(values, isBulkOrder, enableStripePaymentProcessor);
    const {
      firstName,
      lastName,
      address,
      unit,
      city,
      country,
      state,
      postalCode,
      organization,
      purchasedForOrganization,
    } = values;

    const errors = {
      ...validateRequiredFields(requiredFields),
      ...validateAsciiNames(
        firstName,
        lastName,
      ),
    };

    if (Object.keys(errors).length > 0) {
      throw new SubmissionError(errors);
    }

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }
    setMessage('');
    setIsLoading(true);

    onSubmitPayment({
      cardHolderInfo: {
        firstName,
        lastName,
        address,
        unit,
        city,
        country,
        state,
        postalCode,
        organization,
        purchasedForOrganization,
      },
      stripe,
      elements,
      context,
      products,
    });
  };

  const stripeElementsOnReady = () => {
    setIsLoading(false);
    markPerformanceIfAble('Stripe Elements component rendered');
    sendTrackEvent(
      'edx.bi.ecommerce.payment_mfe.payment_form_rendered',
      {
        ...getPerformanceProperties(),
        paymentProcessor: 'Stripe',
      },
    );
  };

  return (
    <form id="payment-form" ref={inputElement} onSubmit={handleSubmit(onSubmit)} noValidate>
      <CardHolderInformation
        showBulkEnrollmentFields={isBulkOrder}
        disabled={disabled}
        enableStripePaymentProcessor={enableStripePaymentProcessor}
      />
      <h5 aria-level="2">
        <FormattedMessage
          id="payment.card.details.billing.information.heading"
          defaultMessage="Billing Information (Required)"
          description="The heading for the required credit card details billing information form"
        />
      </h5>
      <PaymentElement
        id="payment-element"
        options={options}
        onReady={stripeElementsOnReady}
      />
      <PlaceOrderButton
        onSubmitButtonClick={onSubmitButtonClick}
        showLoadingButton={showLoadingButton}
        disabled={disabled}
        isProcessing={isProcessing}
      />
      {message && <div id="payment-message">{message}</div>}
    </form>
  );
}

StripePaymentForm.propTypes = {
  disabled: PropTypes.bool,
  enableStripePaymentProcessor: PropTypes.bool,
  handleSubmit: PropTypes.func.isRequired,
  isBulkOrder: PropTypes.bool,
  loading: PropTypes.bool,
  isQuantityUpdating: PropTypes.bool,
  isProcessing: PropTypes.bool,
  onSubmitButtonClick: PropTypes.func.isRequired,
  onSubmitPayment: PropTypes.func.isRequired,
  options: PropTypes.object, // eslint-disable-line react/forbid-prop-types,
  submitErrors: PropTypes.objectOf(PropTypes.string),
  products: PropTypes.array, // eslint-disable-line react/forbid-prop-types,
};

StripePaymentForm.defaultProps = {
  disabled: false,
  enableStripePaymentProcessor: true,
  isBulkOrder: false,
  loading: false,
  isQuantityUpdating: false,
  isProcessing: false,
  submitErrors: {},
  products: [],
  options: null,
};

export default reduxForm({ form: 'stripe' })(connect(
  null,
)(injectIntl(StripePaymentForm)));
