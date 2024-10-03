# Ignore this unless testing prod build over ssl locally
FROM node:20 as build

WORKDIR /app

COPY package*.json ./
RUN npm ci
RUN npx ngcc --properties es2023 browser module main --first-only --create-ivy-entry-points

COPY . .
RUN npm run build

# Ensure the built files are in the correct location
RUN mkdir -p /app/dist && mv dist/ng-local-record/browser/* /app/dist/

# Set appropriate permissions
RUN chmod -R 755 /app/dist

# Keep the container running for debugging
CMD ["tail", "-f", "/dev/null"]
