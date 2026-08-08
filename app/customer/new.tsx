import React from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '@/state/AppState';
import { CustomerForm } from '@/components/CustomerForm';

export default function NewCustomerScreen() {
  const router = useRouter();
  const { addCustomer } = useApp();

  return (
    <CustomerForm
      submitLabel="Save customer"
      onCancel={() => router.back()}
      onSubmit={async (draft) => {
        const created = await addCustomer(draft);
        router.replace(`/customer/${created.id}`);
      }}
    />
  );
}
