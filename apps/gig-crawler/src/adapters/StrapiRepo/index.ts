import axios from 'axios';
import type { GigsPort } from '../../ports/GigsPort.js';
import { getVenues as getVenuesImpl } from './getVenues.js';
import { getVenueByName as getVenueByNameImpl } from './getVenueByName.js';
import { createVenue as createVenueImpl } from './createVenue.js';
import { getGigs as getGigsImpl } from './getGigs.js';
import { gigExists as gigExistsImpl } from './gigExists.js';
import { createGig as createGigImpl } from './createGig.js';

/**
 * Strapi implementation of GigsPort
 * Handles all CRUD operations for gigs and venues
 */
export function createStrapiRepo(apiUrl: string, apiToken: string): GigsPort {
  const client = axios.create({
    baseURL: `${apiUrl}/api`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    timeout: 10000,
  });

  return {
    getVenues: () => getVenuesImpl(client),
    getVenueByName: (name: string) => getVenueByNameImpl(client, name),
    createVenue: (venue) => createVenueImpl(client, venue),
    getGigs: () => getGigsImpl(client),
    gigExists: (title: string, date: string) => gigExistsImpl(client, title, date),
    createGig: (gig) => createGigImpl(client, gig),
  };
}
