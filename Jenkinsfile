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
        disableConcurrentBuilds()  // ✅ Prevents port conflicts from parallel runs
    }

    stages {

        stage('Initialize') {
            steps {
                echo "Building BreachLens version ${IMAGE_TAG}"
                bat 'npm cache clean --force'
                bat 'rmdir /s /q node_modules || exit 0'
            }
        }

        stage('Install Dependencies (Parallel)') {
            parallel {
                stage('Node.js Deps') {
                    steps {
                        bat 'npm install'
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

        stage('Quality Checks (Parallel)') {
            parallel {
                stage('Node.js Tests') {
                    steps {
                        bat 'npm test'
                    }
                }
                stage('Python Compile Check') {
                    steps {
                        bat 'python -m compileall ml'
                    }
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                bat 'docker compose build'
            }
        }

        stage('Deploy (Staging)') {
            steps {
                bat '''
                echo ===============================
                echo CLEANING OLD DEPLOYMENT
                echo ===============================

                docker compose down --volumes --remove-orphans || exit 0

                docker rm -f breachlens-ml   || exit 0
                docker rm -f breachlens-app  || exit 0
                docker rm -f breachlens-nginx || exit 0
                docker rm -f breachlens-db   || exit 0

                echo ===============================
                echo FREEING PORTS
                echo ===============================

                for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003') do taskkill /F /PID %%a 2>nul || exit 0
                for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8082') do taskkill /F /PID %%a 2>nul || exit 0
                for /f "tokens=5" %%a in ('netstat -ano ^| findstr :27017') do taskkill /F /PID %%a 2>nul || exit 0

                echo ===============================
                echo STARTING NEW DEPLOYMENT
                echo ===============================

                docker compose up -d --build
                '''
            }
        }

        stage('Health Check (Smoke Test)') {
            steps {
                bat '''
                echo ===============================
                echo RUNNING HEALTH CHECKS
                echo ===============================

                set max_retries=10
                set count=0

                :loop
                curl -f http://localhost:8082/health >nul 2>&1
                if %errorlevel%==0 (
                    echo App is healthy!
                    exit /b 0
                )

                set /a count+=1
                if %count%==%max_retries% (
                    echo Health check failed after %max_retries% attempts!
                    exit /b 1
                )

                echo Attempt %count%/%max_retries% - Waiting 5 seconds...
                timeout /t 5 >nul
                goto loop
                '''
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline completed successfully!'
        }

        failure {
            echo '❌ Pipeline failed! Collecting logs...'
            bat 'docker compose logs'
            bat 'docker compose ps'
        }

        always {
            bat 'docker compose ps'
            // ✅ Always clean up to avoid port leaks for next run
            bat 'docker compose down --volumes --remove-orphans || exit 0'
        }
    }
}