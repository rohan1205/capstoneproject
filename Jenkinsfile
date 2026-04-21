pipeline {
    agent any
    
    environment {
        DOCKER_REGISTRY = "ghcr.io"
        IMAGE_NAME = "breachlens"
        IMAGE_TAG = "v2.${BUILD_NUMBER}"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        stage('Initialize') {
            steps {
                echo "Building BreachLens version ${IMAGE_TAG}"
                bat 'rmdir /s /q node_modules || exit 0'
            }
        }

        stage('Parallel: Install Dependencies') {
            parallel {
                stage('Node.js Deps') {
                    steps {
                        bat 'npm ci'
                    }
                }
                stage('Python Deps') {
                    steps {
                        bat 'python -m pip install --upgrade pip'
                        bat 'pip install -r requirements.txt'
                    }
                }
            }
        }

        stage('Parallel: Quality Checks') {
            parallel {
                stage('Node.js Tests') {
                    steps {
                        bat 'npm test'
                    }
                }
                stage('Python Lint/Comp') {
                    steps {
                        bat 'python -m compileall ml'
                    }
                }
            }
        }

        stage('Build & Tag Images') {
            steps {
                bat 'docker compose build'
                // Optional: Tag for registry if credentials provided
                // bat "docker tag breachlens-app ${DOCKER_REGISTRY}/${IMAGE_NAME}-app:${IMAGE_TAG}"
            }
        }

        stage('Deploy (Staging)') {
            steps {
                bat 'docker compose down --remove-orphans || exit 0'
                bat 'docker compose up -d'
            }
        }

        stage('Smoke Tests') {
            steps {
                echo "Waiting for services to be healthy..."
                bat "powershell -Command \"Start-Sleep -Seconds 15\""
                
                // Check Nginx endpoint (Proxy for App)
                bat 'curl -f http://localhost/health || exit 1'
                
                // Check direct ML health (Mapped to 8001 in compose)
                bat 'curl -f http://localhost:8001/health || exit 1'
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline completed successfully!'
        }
        failure {
            echo '❌ Pipeline failed! Rolling back or checking logs...'
            bat 'docker compose logs app'
        }
        always {
            bat 'docker compose ps'
        }
    }
}

